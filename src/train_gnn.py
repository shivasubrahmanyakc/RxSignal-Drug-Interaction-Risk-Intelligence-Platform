import os
import torch
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv
from torch_geometric.data import Data
import joblib
import pandas as pd
import numpy as np
from sklearn.metrics import r2_score, mean_squared_error, accuracy_score, precision_score, recall_score, f1_score, classification_report

def calculate_classification_metrics(y_true, y_pred, threshold=5.0):
    y_true_bin = (y_true > threshold).astype(int)
    y_pred_bin = (y_pred > threshold).astype(int)
    acc = accuracy_score(y_true_bin, y_pred_bin)
    prec = precision_score(y_true_bin, y_pred_bin, zero_division=0)
    rec = recall_score(y_true_bin, y_pred_bin, zero_division=0)
    f1 = f1_score(y_true_bin, y_pred_bin, zero_division=0)
    return acc, prec, rec, f1

class RiskGraphSAGE(torch.nn.Module):
    def __init__(self, num_node_features):
        super(RiskGraphSAGE, self).__init__()
        self.conv1 = SAGEConv(num_node_features, 256)
        self.bn1 = torch.nn.BatchNorm1d(256)
        
        self.conv2 = SAGEConv(256, 128)
        self.bn2 = torch.nn.BatchNorm1d(128)
        
        self.conv3 = SAGEConv(128, 64)
        self.bn3 = torch.nn.BatchNorm1d(64)
        
        self.fc1 = torch.nn.Linear(64 * 2, 32)
        self.fc2 = torch.nn.Linear(32, 1)
        self.dropout = torch.nn.Dropout(0.3)

    def encode(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = self.bn1(x)
        x = F.relu(x)
        x = self.dropout(x)
        
        x = self.conv2(x, edge_index)
        x = self.bn2(x)
        x = F.relu(x)
        x = self.dropout(x)
        
        x = self.conv3(x, edge_index)
        x = self.bn3(x)
        return x

    def decode(self, z, edge_index):
        src, dst = edge_index
        edge_features = torch.cat([z[src], z[dst]], dim=1)
        out = F.relu(self.fc1(edge_features))
        out = self.dropout(out)
        return self.fc2(out).squeeze()
        
    def decode_from_embeddings(self, z_src, z_dst):
        edge_features = torch.cat([z_src, z_dst], dim=1)
        out = F.relu(self.fc1(edge_features))
        return self.fc2(out).squeeze()

def train_gnn(graph_path, model_dir):
    print("Loading PyTorch Geometric Graph (Log-Transformed Edges)...")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    data = torch.load(graph_path)
    data = data.to(device)
    
    model = RiskGraphSAGE(num_node_features=data.num_node_features).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.005, weight_decay=1e-4)
    criterion = torch.nn.MSELoss()
    
    num_edges = data.edge_index.size(1)
    indices = torch.randperm(num_edges)
    train_size = int(num_edges * 0.8)
    
    train_idx = indices[:train_size]
    test_idx = indices[train_size:]
    
    epochs = 600
    print(f"Starting DEEP GraphSAGE Training ({epochs} Epochs, Log-Transform)...")
    for epoch in range(1, epochs + 1):
        model.train()
        optimizer.zero_grad()
        
        z = model.encode(data.x, data.edge_index)
        predictions = model.decode(z, data.edge_index)
        
        loss = criterion(predictions[train_idx], data.edge_attr[train_idx].squeeze())
        loss.backward()
        optimizer.step()
        
        if epoch % 50 == 0:
            print(f'Epoch: {epoch:03d}, Loss (MSE): {loss.item():.4f}')
            
    print("\n" + "="*70)
    print("EVALUATING DEEP GraphSAGE MODEL (Log-Transform)")
    print("="*70)
    
    model.eval()
    with torch.no_grad():
        z = model.encode(data.x, data.edge_index)
        predictions = model.decode(z, data.edge_index)
        
        test_pred_log = predictions[test_idx].cpu().numpy()
        test_true_log = data.edge_attr[test_idx].squeeze().cpu().numpy()
        
        # R² in log space
        log_mse = mean_squared_error(test_true_log, test_pred_log)
        log_r2 = r2_score(test_true_log, test_pred_log)
        print(f"\nLog-Space Regression -> MSE: {log_mse:.4f} | R² Score: {log_r2:.4f}")
        
        # Convert back to original scale
        test_true_orig = np.expm1(test_true_log)
        test_pred_orig = np.expm1(test_pred_log)
        
        orig_mse = mean_squared_error(test_true_orig, test_pred_orig)
        orig_r2 = r2_score(test_true_orig, test_pred_orig)
        print(f"Original-Scale Regression -> MSE: {orig_mse:.4f} | R² Score: {orig_r2:.4f}")
        
        # Classification metrics on original scale
        threshold = 5.0
        acc, prec, rec, f1 = calculate_classification_metrics(test_true_orig, test_pred_orig, threshold)
        
        print(f"\nClassification Metrics (Risk > {threshold}):")
        print(f"  Accuracy:  {acc:.4f}")
        print(f"  Precision: {prec:.4f}")
        print(f"  Recall:    {rec:.4f}")
        print(f"  F1-Score:  {f1:.4f}")
        
        y_true_bin = (test_true_orig > threshold).astype(int)
        y_pred_bin = (test_pred_orig > threshold).astype(int)
        print(f"\nFull Classification Report:")
        print(classification_report(y_true_bin, y_pred_bin, target_names=["LOW RISK", "SIGNIFICANT RISK"]))
        
    metrics = (f"GNN Log-R2: {log_r2:.4f}, Orig-R2: {orig_r2:.4f}, "
               f"Acc: {acc:.4f}, Prec: {prec:.4f}, Rec: {rec:.4f}, F1: {f1:.4f}")
    with open(os.path.join(model_dir, "..", "gnn_metrics.txt"), "w") as f:
        f.write(metrics)
        
    print("Saving GNN Model...")
    os.makedirs(model_dir, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(model_dir, "risk_gnn.pth"))
    
    with torch.no_grad():
        final_embeddings = model.encode(data.x, data.edge_index).cpu()
        torch.save(final_embeddings, os.path.join(model_dir, "gnn_node_embeddings.pth"))
        
    print("GNN Assets Saved successfully.")

if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    graph_path = os.path.join(base_dir, "processed", "faers_graph.pt")
    model_dir = os.path.join(base_dir, "models")
    
    train_gnn(graph_path, model_dir)
