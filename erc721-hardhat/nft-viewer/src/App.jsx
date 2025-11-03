import { useState } from "react";
import { ethers } from "ethers";
import MyNFT from "../../artifacts/contracts/MyNFT.sol/MyNFT.json"; // adjust path

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export default function App() {
  const [account, setAccount] = useState(null);
  const [nfts, setNfts] = useState([]);

  async function connect() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    setAccount(addr);

    const contract = new ethers.Contract(CONTRACT_ADDRESS, MyNFT.abi, signer);
    await loadNFTs(contract, addr);
  }

  async function loadNFTs(contract, ownerAddr) {
    const items = [];
  
    for (let i = 0; i < 50; i++) { // arbitrary upper bound
      try {
        const owner = await contract.ownerOf(i);
        if (owner.toLowerCase() === ownerAddr.toLowerCase()) {
          const uri = await contract.tokenURI(i);
          const metadata = await fetch(uri.replace("ipfs://", "https://ipfs.io/ipfs/")).then(r => r.json());
          items.push({ id: i, ...metadata });
        }
      } catch (err) {
        console.log(err);
        break; // stops when it hits a non-existent tokenId
      }
    }
  
    setNfts(items);
  }

  return (
    <div>
      <h1>My NFTs</h1>
      {!account && <button onClick={connect}>Connect Wallet</button>}
      {account && (
        <div>
          <p>Connected: {account}</p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {nfts.map(n => (
              <div key={n.id}>
                <img src={n.image} alt={n.name} width="150" />
                <p>{n.name}</p>
                <p>Token #{n.id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
