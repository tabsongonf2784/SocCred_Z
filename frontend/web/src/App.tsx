import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface SocialCreditData {
  id: string;
  name: string;
  encryptedScore: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface CreditStats {
  totalUsers: number;
  avgScore: number;
  verifiedCount: number;
  recentActivity: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<SocialCreditData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingCredit, setCreatingCredit] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newCreditData, setNewCreditData] = useState({ name: "", score: "", description: "" });
  const [selectedCredit, setSelectedCredit] = useState<SocialCreditData | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<CreditStats>({ totalUsers: 0, avgScore: 0, verifiedCount: 0, recentActivity: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        console.log('Initializing FHEVM for Social Credit System...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const creditsList: SocialCreditData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          creditsList.push({
            id: businessId,
            name: businessData.name,
            encryptedScore: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading credit data:', e);
        }
      }
      
      setCredits(creditsList);
      calculateStats(creditsList);
      updateUserHistory();
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const calculateStats = (creditList: SocialCreditData[]) => {
    const totalUsers = creditList.length;
    const verifiedCount = creditList.filter(c => c.isVerified).length;
    const recentActivity = creditList.filter(c => 
      Date.now()/1000 - c.timestamp < 60 * 60 * 24
    ).length;
    const avgScore = totalUsers > 0 ? creditList.reduce((sum, c) => sum + c.publicValue1, 0) / totalUsers : 0;
    
    setStats({ totalUsers, avgScore, verifiedCount, recentActivity });
  };

  const updateUserHistory = () => {
    if (!address) return;
    
    const newHistory = [
      { action: "Data Refresh", timestamp: Date.now(), status: "completed" },
      { action: "FHE System Check", timestamp: Date.now() - 1000, status: "verified" },
      ...userHistory.slice(0, 4)
    ];
    setUserHistory(newHistory);
  };

  const testAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "FHE System Available ✓" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const createCredit = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingCredit(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting social credit data with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const scoreValue = parseInt(newCreditData.score) || 0;
      const businessId = `credit-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, scoreValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newCreditData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        Math.floor(Math.random() * 100),
        0,
        newCreditData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Storing encrypted data on-chain..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Social credit created with FHE encryption! 🔐" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewCreditData({ name: "", score: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingCredit(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Credit score already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying FHE decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Credit score decrypted and verified! 🔓" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const handleDecryptCredit = async (credit: SocialCreditData) => {
    const decrypted = await decryptData(credit.id);
    if (decrypted !== null) {
      setDecryptedScore(decrypted);
    }
  };

  const renderStatsDashboard = () => {
    return (
      <div className="stats-dashboard">
        <div className="stat-card neon-purple">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">Total Users</div>
          </div>
        </div>
        
        <div className="stat-card neon-blue">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgScore.toFixed(1)}</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>
        
        <div className="stat-card neon-pink">
          <div className="stat-icon">🔐</div>
          <div className="stat-content">
            <div className="stat-value">{stats.verifiedCount}</div>
            <div className="stat-label">Verified</div>
          </div>
        </div>
        
        <div className="stat-card neon-green">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <div className="stat-value">{stats.recentActivity}</div>
            <div className="stat-label">Today's Activity</div>
          </div>
        </div>
      </div>
    );
  };

  const renderCreditChart = () => {
    const scoreRanges = [0, 0, 0, 0, 0];
    credits.forEach(credit => {
      const range = Math.floor((credit.publicValue1 || 0) / 20);
      if (range >= 0 && range < 5) scoreRanges[range]++;
    });

    return (
      <div className="credit-chart">
        <h3>Credit Score Distribution</h3>
        <div className="chart-bars">
          {scoreRanges.map((count, index) => (
            <div key={index} className="chart-bar-container">
              <div 
                className="chart-bar"
                style={{ height: `${(count / Math.max(1, credits.length)) * 100}%` }}
              >
                <span className="bar-count">{count}</span>
              </div>
              <div className="bar-label">{index * 20}-{(index + 1) * 20}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderUserHistory = () => {
    return (
      <div className="user-history">
        <h3>Recent Activity</h3>
        <div className="history-list">
          {userHistory.map((item, index) => (
            <div key={index} className="history-item">
              <div className="history-action">{item.action}</div>
              <div className="history-time">{new Date(item.timestamp).toLocaleTimeString()}</div>
              <div className={`history-status ${item.status}`}>{item.status}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>SocCred_Z 🔐</h1>
            <span>Private Social Credit System</span>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Wallet to Access Private Credit System</h2>
            <p>FHE-encrypted social credit scores with privacy-preserving verification</p>
            <div className="fhe-features">
              <div className="feature">🔒 Encrypted Data Sources</div>
              <div className="feature">⚡ Homomorphic Computation</div>
              <div className="feature">🔐 Privacy-Preserving Verification</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing your social credit data</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted credit system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>SocCred_Z 🔐</h1>
          <span>FHE-Powered Social Credit</span>
        </div>
        
        <div className="header-actions">
          <button onClick={testAvailability} className="test-btn">
            Test FHE System
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Credit
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-section">
          {renderStatsDashboard()}
          
          <div className="content-grid">
            <div className="content-panel">
              <h2>FHE Credit Encryption Flow</h2>
              <div className="fhe-flow">
                <div className="flow-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Data Encryption</h4>
                    <p>Credit scores encrypted with Zama FHE 🔐</p>
                  </div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>On-chain Storage</h4>
                    <p>Encrypted data stored with public verification</p>
                  </div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Zero-Knowledge Proof</h4>
                    <p>Offline decryption with FHE.checkSignatures</p>
                  </div>
                </div>
              </div>
            </div>
            
            {renderCreditChart()}
          </div>
        </div>
        
        <div className="credits-section">
          <div className="section-header">
            <h2>Social Credit Records</h2>
            <div className="header-actions">
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="credits-list">
            {credits.length === 0 ? (
              <div className="no-credits">
                <p>No credit records found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Record
                </button>
              </div>
            ) : credits.map((credit, index) => (
              <div 
                className={`credit-item ${selectedCredit?.id === credit.id ? "selected" : ""} ${credit.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedCredit(credit)}
              >
                <div className="credit-header">
                  <div className="credit-name">{credit.name}</div>
                  <div className={`credit-status ${credit.isVerified ? "verified" : "encrypted"}`}>
                    {credit.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                  </div>
                </div>
                <div className="credit-meta">
                  <span>Public Score: {credit.publicValue1}</span>
                  <span>Created: {new Date(credit.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="credit-description">{credit.description}</div>
                <div className="credit-actions">
                  <button 
                    className={`decrypt-btn ${credit.isVerified ? 'verified' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDecryptCredit(credit);
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : credit.isVerified ? "✅ Verified" : "🔓 Decrypt"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {renderUserHistory()}
      </div>
      
      {showCreateModal && (
        <ModalCreateCredit 
          onSubmit={createCredit} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingCredit} 
          creditData={newCreditData} 
          setCreditData={setNewCreditData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedCredit && (
        <CreditDetailModal 
          credit={selectedCredit} 
          onClose={() => { 
            setSelectedCredit(null); 
            setDecryptedScore(null); 
          }} 
          decryptedScore={decryptedScore} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => handleDecryptCredit(selectedCredit)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateCredit: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  creditData: any;
  setCreditData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, creditData, setCreditData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'score') {
      const intValue = value.replace(/[^\d]/g, '');
      setCreditData({ ...creditData, [name]: intValue });
    } else {
      setCreditData({ ...creditData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-credit-modal">
        <div className="modal-header">
          <h2>New Social Credit Record</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Privacy Protection</strong>
            <p>Credit score will be encrypted with Zama FHE (Integer encryption only)</p>
          </div>
          
          <div className="form-group">
            <label>User Name *</label>
            <input 
              type="text" 
              name="name" 
              value={creditData.name} 
              onChange={handleChange} 
              placeholder="Enter user name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Credit Score (Integer only) *</label>
            <input 
              type="number" 
              name="score" 
              value={creditData.score} 
              onChange={handleChange} 
              placeholder="Enter credit score..." 
              step="1"
              min="0"
              max="100"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={creditData.description} 
              onChange={handleChange} 
              placeholder="Enter description..." 
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !creditData.name || !creditData.score} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting with FHE..." : "Create Credit Record"}
          </button>
        </div>
      </div>
    </div>
  );
};

const CreditDetailModal: React.FC<{
  credit: SocialCreditData;
  onClose: () => void;
  decryptedScore: number | null;
  isDecrypting: boolean;
  decryptData: () => Promise<void>;
}> = ({ credit, onClose, decryptedScore, isDecrypting, decryptData }) => {
  return (
    <div className="modal-overlay">
      <div className="credit-detail-modal">
        <div className="modal-header">
          <h2>Credit Record Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="credit-info">
            <div className="info-item">
              <span>User Name:</span>
              <strong>{credit.name}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{credit.creator.substring(0, 6)}...{credit.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Created:</span>
              <strong>{new Date(credit.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Public Rating:</span>
              <strong>{credit.publicValue1}/100</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>FHE-Encrypted Credit Score</h3>
            
            <div className="data-row">
              <div className="data-label">Credit Score:</div>
              <div className="data-value">
                {credit.isVerified ? 
                  `${credit.decryptedValue} (On-chain Verified)` : 
                  decryptedScore !== null ? 
                  `${decryptedScore} (Locally Decrypted)` : 
                  "🔒 FHE Encrypted Integer"
                }
              </div>
              <button 
                className={`decrypt-btn ${(credit.isVerified || decryptedScore !== null) ? 'decrypted' : ''}`}
                onClick={decryptData} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 Decrypting..."
                ) : credit.isVerified ? (
                  "✅ Verified"
                ) : decryptedScore !== null ? (
                  "🔄 Re-verify"
                ) : (
                  "🔓 Decrypt Score"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Privacy Protection</strong>
                <p>Credit score is encrypted on-chain using Zama FHE. Decryption requires zero-knowledge proof verification.</p>
              </div>
            </div>
          </div>
          
          <div className="description-section">
            <h3>Description</h3>
            <p>{credit.description}</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!credit.isVerified && (
            <button 
              onClick={decryptData} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


