import { useState } from "react";
import { ethers } from "ethers";
import MyNFT from "../../artifacts/contracts/MyNFT.sol/MyNFT.json";
import "./App.css";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export default function App() {
  const [account, setAccount] = useState(null);
  const [nfts, setNfts] = useState([]);
  const [contract, setContract] = useState(null);
  const [transferInputs, setTransferInputs] = useState({});
  const [loading, setLoading] = useState(false);

  async function connect() {
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);

      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, MyNFT.abi, signer);
      setContract(contractInstance);
      await loadNFTs(contractInstance, addr);
    } catch (error) {
      console.error("Connection failed:", error);
      alert("Failed to connect wallet: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadNFTs(contract, ownerAddr) {
    const items = [];
  
    for (let i = 0; i < 50; i++) { 
      try {
        const owner = await contract.ownerOf(i);
        if (owner.toLowerCase() === ownerAddr.toLowerCase()) {
          const uri = await contract.tokenURI(i);
          const metadata = await fetch(uri.replace("ipfs://", "https://ipfs.io/ipfs/")).then(r => r.json());
          
          if (metadata.image && metadata.image.startsWith("ipfs://")) {
            metadata.image = metadata.image.replace("ipfs://", "https://ipfs.io/ipfs/");
          }
          
          items.push({ id: i, ...metadata });
        }
      } catch (err) {
        console.log(err);
        break;
      }
    }
  
    setNfts(items);
  }

  async function transferNFT(tokenId, toAddress) {
    if (!contract || !toAddress) {
      alert("Please enter a valid address");
      return;
    }

    try {
      // Check if the address is valid
      if (!ethers.isAddress(toAddress)) {
        alert("Invalid Ethereum address");
        return;
      }

      const tx = await contract.transferFrom(account, toAddress, tokenId);
      console.log("Transfer transaction:", tx.hash);
      
      // Wait for transaction confirmation
      await tx.wait();
      console.log("Transfer confirmed!");
      
      // Reload NFTs after transfer
      await loadNFTs(contract, account);
      
      // Clear the input field
      setTransferInputs(prev => ({
        ...prev,
        [tokenId]: ""
      }));
      
      alert("NFT transferred successfully!");
    } catch (error) {
      console.error("Transfer failed:", error);
      alert("Transfer failed: " + error.message);
    }
  }

  function updateTransferInput(tokenId, value) {
    setTransferInputs(prev => ({
      ...prev,
      [tokenId]: value
    }));
  }

  function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  return (
    <div className="app">
      <div className="header">
        <h1>🎨 My NFT Collection</h1>
        <p>Discover, view, and transfer your digital assets</p>
      </div>

      {!account ? (
        <div className="connect-section">
          <h2>Connect Your Wallet</h2>
          <p>Connect your MetaMask wallet to view your NFT collection</p>
          <button 
            className="connect-button" 
            onClick={connect}
            disabled={loading}
          >
            {loading ? "Connecting..." : "🦊 Connect MetaMask"}
          </button>
        </div>
      ) : (
        <div>
          <div className="wallet-info">
            <h3>🔗 Wallet Connected</h3>
            <div className="wallet-address">
              {formatAddress(account)}
            </div>
          </div>

          {loading ? (
            <div className="loading">
              <h3>Loading your NFTs...</h3>
            </div>
          ) : nfts.length === 0 ? (
            <div className="empty-state">
              <h3>📱 No NFTs Found</h3>
              <p>You don't have any NFTs in this collection yet.</p>
            </div>
          ) : (
            <div className="nft-grid">
              {nfts.map(n => (
                <div key={n.id} className="nft-card">
                  <img 
                    src={n.image} 
                    alt={n.name} 
                    className="nft-image"
                    onError={(e) => {
                      e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250' viewBox='0 0 250 250'%3E%3Crect width='250' height='250' fill='%23ddd'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='16' fill='%23999'%3EImage not available%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  <div className="nft-info">
                    <h3 className="nft-name">{n.name || `NFT #${n.id}`}</h3>
                    <span className="nft-token-id">Token #{n.id}</span>
                    {n.description && (
                      <p style={{ color: "#ccc", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                        {n.description}
                      </p>
                    )}
                  </div>
                  
                  <div className="transfer-section">
                    <h4 style={{ marginBottom: "1rem", color: "#fff" }}>🔄 Transfer NFT</h4>
                    <input
                      className="transfer-input"
                      type="text"
                      placeholder="Enter recipient address (0x...)"
                      value={transferInputs[n.id] || ""}
                      onChange={(e) => updateTransferInput(n.id, e.target.value)}
                    />
                    <button
                      className="transfer-button"
                      onClick={() => transferNFT(n.id, transferInputs[n.id])}
                      disabled={!transferInputs[n.id]}
                    >
                      Transfer NFT
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
