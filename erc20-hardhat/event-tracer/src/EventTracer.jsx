import React, { useState, useRef } from "react";
import { ethers } from "ethers";
export default function EventTracer() {
  const [rpc, setRpc] = useState("http://127.0.0.1:8545");
  const [target, setTarget] = useState("");
  const [blocksBack, setBlocksBack] = useState(10000);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("idle");
  const providerRef = useRef(null);
  const ifaceRef = useRef(new ethers.utils.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ]));
  function normalizeAddress(addr){
    try { return ethers.utils.getAddress(addr); } catch { return null; }
  }
  function addrTopic(addr){
    return ethers.utils.hexZeroPad(ethers.utils.getAddress(addr), 32);
  }
  async function ensureProvider(){
    if(!providerRef.current) providerRef.current = new ethers.providers.JsonRpcProvider(rpc);
    return providerRef.current;
  }
  async function fetchPast(){
    const addr = normalizeAddress(target);
    if(!addr) return setStatus("Invalid address");
    setStatus("fetching");
    const provider = await ensureProvider();
    try{
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - Number(blocksBack));
      const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
      const approvalTopic = ethers.utils.id("Approval(address,address,uint256)");
      const topicAddr = addrTopic(addr);
      const logs = [];
      const logsFrom = await provider.getLogs({fromBlock, toBlock: latest, topics: [transferTopic, topicAddr]});
      const logsTo = await provider.getLogs({fromBlock, toBlock: latest, topics: [transferTopic, null, topicAddr]});
      const logsApprovalOwner = await provider.getLogs({fromBlock, toBlock: latest, topics: [approvalTopic, topicAddr]});
      const logsApprovalSpender = await provider.getLogs({fromBlock, toBlock: latest, topics: [approvalTopic, null, topicAddr]});
      logs.push(...logsFrom, ...logsTo, ...logsApprovalOwner, ...logsApprovalSpender);
      const parsed = logs.map(l => parseLog(l));
      parsed.sort((a,b)=>a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
      setEvents(prev => [...parsed, ...prev]);
      setStatus(`found ${parsed.length} events (scanned ${blocksBack} blocks)`);
    }catch(e){
      setStatus("error: " + String(e));
    }
  }
  function parseLog(log){
    try{
      const parsed = ifaceRef.current.parseLog(log);
      return {
        contract: log.address,
        name: parsed.name,
        args: parsed.args,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex
      };
    }catch{
      return { contract: log.address, name: "unknown", raw: log, txHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex };
    }
  }
  let blockListener = useRef(null);
  async function subscribeLive(){
    const addr = normalizeAddress(target);
    if(!addr) return setStatus("Invalid address");
    setStatus("subscribing");
    const provider = await ensureProvider();
    if(blockListener.current) return setStatus("already subscribed");
    blockListener.current = async (blockNumber) => {
      try{
        const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
        const approvalTopic = ethers.utils.id("Approval(address,address,uint256)");
        const topicAddr = addrTopic(addr);
        const logsFrom = await provider.getLogs({fromBlock: blockNumber, toBlock: blockNumber, topics: [transferTopic, topicAddr]});
        const logsTo = await provider.getLogs({fromBlock: blockNumber, toBlock: blockNumber, topics: [transferTopic, null, topicAddr]});
        const logsApprovalOwner = await provider.getLogs({fromBlock: blockNumber, toBlock: blockNumber, topics: [approvalTopic, topicAddr]});
        const logsApprovalSpender = await provider.getLogs({fromBlock: blockNumber, toBlock: blockNumber, topics: [approvalTopic, null, topicAddr]});
        const logs = [...logsFrom, ...logsTo, ...logsApprovalOwner, ...logsApprovalSpender];
        if(logs.length){
          const parsed = logs.map(l=>parseLog(l));
          setEvents(prev=>[...parsed, ...prev]);
        }
      }catch(e){
        console.error(e);
      }
    };
    provider.on('block', blockListener.current);
  }
  async function unsubscribeLive(){
    const provider = providerRef.current;
    if(provider && blockListener.current){
      provider.off('block', blockListener.current);
      blockListener.current = null;
      setStatus('unsubscribed');
    }
  }
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Event Tracer</h1>
      <div className="grid gap-3">
        <input className="p-2 border" value={rpc} onChange={e=>{setRpc(e.target.value); providerRef.current = null}} placeholder="RPC URL" />
        <input className="p-2 border" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Address to trace (0x...)" />
        <div className="flex gap-2">
          <input className="p-2 border w-32" value={blocksBack} onChange={e=>setBlocksBack(e.target.value)} />
          <button className="px-3 py-2 bg-slate-700 text-white rounded" onClick={fetchPast}>Fetch past events</button>
          <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={subscribeLive}>Subscribe live</button>
          <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={unsubscribeLive}>Stop</button>
        </div>
        <div className="text-sm text-gray-600">Status: {status}</div>
      </div>
      <div className="mt-6">
        <h2 className="text-xl font-semibold">Events ({events.length})</h2>
        <div className="space-y-2 mt-3">
          {events.map((e, i) => (
            <div key={i} className="p-3 border rounded">
              <div className="text-sm text-gray-500">#{e.blockNumber} • {e.contract} • {e.txHash}</div>
              <div className="font-mono">{e.name}</div>
              <div className="mt-2">
                {e.name === 'unknown' ? (
                  <pre className="text-xs">{JSON.stringify(e.raw || {}, null, 2)}</pre>
                ):(
                  Object.keys(e.args || {}).filter(k=>isNaN(Number(k))).map(k=> (
                    <div key={k} className="text-sm"><strong>{k}:</strong> {String(e.args[k])}</div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
