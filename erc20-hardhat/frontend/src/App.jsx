import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './App.css'

function App() {
  const [address, setAddress] = useState('')
  const [spender, setSpender] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [token, setToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  // New state for transferFrom functionality
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferHistory, setTransferHistory] = useState([])
  const [blockchainHistory, setBlockchainHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [activeTab, setActiveTab] = useState('approve') // 'approve', 'transfer', 'history', 'buy'
  const [historySource, setHistorySource] = useState('local') // 'local' or 'blockchain'

  // New state for token buying functionality
  const [tokenSaleAddress, setTokenSaleAddress] = useState('')
  const [ethAmount, setEthAmount] = useState('')
  const [tokenRate, setTokenRate] = useState('')
  const [tokensToReceive, setTokensToReceive] = useState('')
  const [saleStats, setSaleStats] = useState({
    totalEthRaised: '0',
    totalTokensSold: '0',
    availableTokens: '0',
    tokenPrice: '0'
  })

  // Load transfer history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('transferHistory')
    if (savedHistory) {
      setTransferHistory(JSON.parse(savedHistory))
    }
  }, [])

  // Save transfer history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('transferHistory', JSON.stringify(transferHistory))
  }, [transferHistory])

  async function connect() {
    if (!window.ethereum) return alert('MetaMask not found')
    const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' })
    setAddress(addr)
  }

  async function fetchSaleInfo() {
    if (!tokenSaleAddress) return
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const abi = [
        'function rate() view returns (uint256)',
        'function getTokenPrice() view returns (uint256)',
        'function totalEthRaised() view returns (uint256)',
        'function totalTokensSold() view returns (uint256)',
        'function getTokenBalance() view returns (uint256)',
        'function calculateTokens(uint256 ethAmount) view returns (uint256)'
      ]
      const contract = new ethers.Contract(tokenSaleAddress, abi, provider)

      const [rate, tokenPrice, totalEthRaised, totalTokensSold, availableTokens] = await Promise.all([
        contract.rate(),
        contract.getTokenPrice(),
        contract.totalEthRaised(),
        contract.totalTokensSold(),
        contract.getTokenBalance()
      ])

      setTokenRate(ethers.utils.formatUnits(rate, 0)) // rate is already in token units
      setSaleStats({
        totalEthRaised: ethers.utils.formatEther(totalEthRaised),
        totalTokensSold: ethers.utils.formatUnits(totalTokensSold, 18),
        availableTokens: ethers.utils.formatUnits(availableTokens, 18),
        tokenPrice: ethers.utils.formatEther(tokenPrice)
      })

      // Calculate tokens for current ETH amount
      if (ethAmount) {
        const tokens = await contract.calculateTokens(ethers.utils.parseEther(ethAmount))
        setTokensToReceive(ethers.utils.formatUnits(tokens, 18))
      }
    } catch (err) {
      console.error('Error fetching sale info:', err)
    }
  }

  async function buyTokens() {
    if (!tokenSaleAddress || !ethAmount) return alert('Missing inputs for token purchase')
    if (parseFloat(ethAmount) <= 0) return alert('ETH amount must be greater than 0')
    
    setIsLoading(true)
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()

      const abi = [
        'function buyTokens() payable',
        'function calculateTokens(uint256 ethAmount) view returns (uint256)'
      ]
      const contract = new ethers.Contract(tokenSaleAddress, abi, signer)

      const ethValue = ethers.utils.parseEther(ethAmount)
      const expectedTokens = await contract.calculateTokens(ethValue)
      
      setStatus(`Buying ${ethers.utils.formatUnits(expectedTokens, 18)} tokens for ${ethAmount} ETH...`)
      
      const tx = await contract.buyTokens({ value: ethValue })
      setStatus('Purchase transaction sent...')
      
      const receipt = await tx.wait()
      setStatus('✅ Tokens purchased successfully!')

      // Clear form and refresh sale info
      setEthAmount('')
      setTokensToReceive('')
      await fetchSaleInfo()
      
    } catch (err) {
      console.error(err)
      setStatus('❌ Error purchasing tokens')
    } finally {
      setIsLoading(false)
    }
  }

  async function fetchBlockchainHistory() {
    if (!token) return alert('Please enter a token contract address')
    setIsLoadingHistory(true)
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      
      const abi = [
        'event Transfer(address indexed from, address indexed to, uint256 value)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)'
      ]
      const contract = new ethers.Contract(token, abi, provider)

      // Get current block number
      const currentBlock = await provider.getBlockNumber()
      // Look back 10,000 blocks (roughly 1-2 days on Ethereum mainnet)
      const fromBlock = Math.max(0, currentBlock - 10000)

      setStatus('📡 Fetching transfer history from blockchain...')

      // Get Transfer events
      const transferEvents = await contract.queryFilter(
        contract.filters.Transfer(),
        fromBlock,
        currentBlock
      )

      // Get token metadata
      const [decimals, symbol, tokenName] = await Promise.all([
        contract.decimals(),
        contract.symbol(),
        contract.name()
      ])

      // Process events and get additional transaction details
      const processedHistory = await Promise.all(
        transferEvents.slice(-50).reverse().map(async (event) => { // Get last 50 events
          try {
            const tx = await provider.getTransaction(event.transactionHash)
            const receipt = await provider.getTransactionReceipt(event.transactionHash)
            
            // Check if this was a transferFrom (not a direct transfer)
            // transferFrom typically shows spender as the transaction sender, not the 'from' address
            const isTransferFrom = tx.from.toLowerCase() !== event.args.from.toLowerCase()
            
            return {
              id: `${event.transactionHash}-${event.logIndex}`,
              txHash: event.transactionHash,
              from: event.args.from,
              to: event.args.to,
              amount: ethers.utils.formatUnits(event.args.value, decimals),
              tokenAddress: token,
              tokenName,
              tokenSymbol: symbol,
              timestamp: new Date(
                (await provider.getBlock(event.blockNumber)).timestamp * 1000
              ).toISOString(),
              blockNumber: event.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              gasPrice: tx.gasPrice?.toString() || '0',
              spender: isTransferFrom ? tx.from : null, // The actual spender who called transferFrom
              isTransferFrom,
              source: 'blockchain'
            }
          } catch (error) {
            console.warn('Error processing event:', error)
            return null
          }
        })
      )

      // Filter out null entries and sort by block number (newest first)
      const validHistory = processedHistory
        .filter(item => item !== null)
        .sort((a, b) => b.blockNumber - a.blockNumber)

      setBlockchainHistory(validHistory)
      setStatus(`📡 Found ${validHistory.length} transfer events from blockchain`)
      
    } catch (err) {
      console.error('Error fetching blockchain history:', err)
      setStatus('❌ Error fetching blockchain history')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  async function approve() {
    if (!token || !spender || !amount) return alert('Missing inputs')
    setIsLoading(true)
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()

      const abi = [
        'function approve(address spender, uint256 amount) public returns (bool)',
        'function allowance(address owner, address spender) public view returns (uint256)',
        'function decimals() view returns (uint8)'
      ]
      const contract = new ethers.Contract(token, abi, signer)

      const decimals = await contract.decimals()
      const tx = await contract.approve(spender, ethers.utils.parseUnits(amount, decimals))
      setStatus('Transaction sent...')
      await tx.wait()
      setStatus('✅ Approved successfully!')
    } catch (err) {
      console.error(err)
      setStatus('❌ Error approving')
    } finally {
      setIsLoading(false)
    }
  }

  async function transferFrom() {
    if (!token || !fromAddress || !toAddress || !transferAmount) {
      return alert('Missing inputs for transfer')
    }
    setIsLoading(true)
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()

      const abi = [
        'function transferFrom(address from, address to, uint256 amount) public returns (bool)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)'
      ]
      const contract = new ethers.Contract(token, abi, signer)

      const decimals = await contract.decimals()
      const symbol = await contract.symbol()
      const tokenName = await contract.name()
      
      const tx = await contract.transferFrom(
        fromAddress, 
        toAddress, 
        ethers.utils.parseUnits(transferAmount, decimals)
      )
      setStatus('Transfer transaction sent...')
      
      const receipt = await tx.wait()
      setStatus('✅ Transfer completed successfully!')

      // Add to transfer history
      const newTransfer = {
        id: Date.now(),
        txHash: tx.hash,
        from: fromAddress,
        to: toAddress,
        amount: transferAmount,
        tokenAddress: token,
        tokenName,
        tokenSymbol: symbol,
        timestamp: new Date().toISOString(),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        spender: address, // Current connected address is the spender
        isTransferFrom: true,
        source: 'local'
      }
      
      setTransferHistory(prev => [newTransfer, ...prev])
      
      // Clear transfer form
      setFromAddress('')
      setToAddress('')
      setTransferAmount('')
      
    } catch (err) {
      console.error(err)
      setStatus('❌ Error executing transfer')
    } finally {
      setIsLoading(false)
    }
  }

  async function checkAllowance() {
    if (!token || !spender) return alert('Missing inputs')
    setIsLoading(true)
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const [owner] = await window.ethereum.request({ method: 'eth_accounts' })
      const abi = [
        'function allowance(address owner, address spender) public view returns (uint256)',
        'function decimals() view returns (uint8)'
      ]
      const contract = new ethers.Contract(token, abi, provider)
      const decimals = await contract.decimals()
      const raw = await contract.allowance(owner, spender)
      const readable = ethers.utils.formatUnits(raw, decimals)
      setStatus(`💰 Current Allowance: ${readable} tokens`)
    } catch (err) {
      console.error(err)
      setStatus('❌ Error fetching allowance')
    } finally {
      setIsLoading(false)
    }
  }

  // Update tokens to receive when ETH amount changes
  useEffect(() => {
    if (tokenSaleAddress && ethAmount && parseFloat(ethAmount) > 0) {
      const calculateTokens = async () => {
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum)
          const abi = ['function calculateTokens(uint256 ethAmount) view returns (uint256)']
          const contract = new ethers.Contract(tokenSaleAddress, abi, provider)
          const tokens = await contract.calculateTokens(ethers.utils.parseEther(ethAmount))
          setTokensToReceive(ethers.utils.formatUnits(tokens, 18))
        } catch (err) {
          setTokensToReceive('')
        }
      }
      calculateTokens()
    } else {
      setTokensToReceive('')
    }
  }, [ethAmount, tokenSaleAddress])

  // Auto-fetch sale info when tokenSaleAddress changes
  useEffect(() => {
    if (tokenSaleAddress) {
      fetchSaleInfo()
    }
  }, [tokenSaleAddress])

  const clearHistory = () => {
    if (historySource === 'local') {
      setTransferHistory([])
      setStatus('🗑️ Local transfer history cleared')
    } else {
      setBlockchainHistory([])
      setStatus('🗑️ Blockchain history cleared from view')
    }
  }

  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleString()
  }

  const shortenAddress = (addr) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const getStatusClass = () => {
    if (isLoading || isLoadingHistory) return 'loading'
    if (status.includes('✅')) return 'success'
    if (status.includes('❌')) return 'error'
    if (status.includes('💰') || status.includes('🗑️') || status.includes('📡')) return 'info'
    return 'info'
  }

  const getCurrentHistory = () => {
    return historySource === 'local' ? transferHistory : blockchainHistory
  }

  return (
    <div className="app-container">
      <div className="app-card">
        <h1 className="app-title">ERC-20 Token Manager</h1>
        <p className="app-subtitle">Approve, transfer, buy tokens, and track transaction history</p>
        
        {address ? (
          <div className="connection-status">
            🔗 Connected: {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        ) : (
          <div className="connection-status disconnected">
            <button className="btn-connect" onClick={connect}>
              Connect MetaMask
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'approve' ? 'active' : ''}`}
            onClick={() => setActiveTab('approve')}
          >
            Approve Tokens
          </button>
          <button 
            className={`tab-btn ${activeTab === 'transfer' ? 'active' : ''}`}
            onClick={() => setActiveTab('transfer')}
          >
            Transfer From
          </button>
          <button 
            className={`tab-btn ${activeTab === 'buy' ? 'active' : ''}`}
            onClick={() => setActiveTab('buy')}
          >
            Buy Tokens
          </button>
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History ({getCurrentHistory().length})
          </button>
        </div>

        {/* Token Address Input - Common for approve, transfer, and history tabs */}
        {activeTab !== 'buy' && (
          <div className="form-group">
            <input 
              className="form-input"
              placeholder="Token contract address (0x...)" 
              value={token} 
              onChange={e => setToken(e.target.value)} 
            />
          </div>
        )}

        {/* Buy Tokens Tab */}
        {activeTab === 'buy' && (
          <>
            <div className="form-group">
              <input 
                className="form-input"
                placeholder="TokenSale contract address (0x...)" 
                value={tokenSaleAddress} 
                onChange={e => setTokenSaleAddress(e.target.value)} 
              />
            </div>

            {tokenSaleAddress && (
              <div className="sale-info">
                <h3>Token Sale Information</h3>
                <div className="sale-stats">
                  <div className="stat-item">
                    <span className="stat-label">Exchange Rate:</span>
                    <span className="stat-value">{tokenRate} tokens per ETH</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Token Price:</span>
                    <span className="stat-value">{parseFloat(saleStats.tokenPrice).toFixed(6)} ETH per token</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Available Tokens:</span>
                    <span className="stat-value">{parseFloat(saleStats.availableTokens).toFixed(2)} tokens</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total ETH Raised:</span>
                    <span className="stat-value">{parseFloat(saleStats.totalEthRaised).toFixed(4)} ETH</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total Tokens Sold:</span>
                    <span className="stat-value">{parseFloat(saleStats.totalTokensSold).toFixed(2)} tokens</span>
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <input 
                className="form-input"
                placeholder="ETH amount to spend" 
                value={ethAmount} 
                onChange={e => setEthAmount(e.target.value)}
                type="number"
                step="0.001"
                min="0"
              />
            </div>

            {tokensToReceive && (
              <div className="token-preview">
                <span>You will receive: <strong>{parseFloat(tokensToReceive).toFixed(4)} tokens</strong></span>
              </div>
            )}

            <div className="button-group">
              <button 
                className="btn btn-primary" 
                onClick={buyTokens}
                disabled={isLoading || !address || !tokenSaleAddress || !ethAmount}
              >
                {isLoading ? <span className="loading-spinner"></span> : null}
                Buy Tokens
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={fetchSaleInfo}
                disabled={isLoading || !tokenSaleAddress}
              >
                Refresh Info
              </button>
            </div>

            <div className="buy-info">
              <p><strong>Note:</strong> Make sure you have sufficient ETH in your wallet. Gas fees will be additional to the purchase amount.</p>
            </div>
          </>
        )}

        {/* Approve Tab */}
        {activeTab === 'approve' && (
          <>
            <div className="form-group">
              <input 
                className="form-input"
                placeholder="Spender address (0x...)" 
                value={spender} 
                onChange={e => setSpender(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <input 
                className="form-input"
                placeholder="Amount to approve" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
              />
            </div>

            <div className="button-group">
              <button 
                className="btn btn-primary" 
                onClick={approve}
                disabled={isLoading || !address}
              >
                {isLoading ? <span className="loading-spinner"></span> : null}
                Approve Tokens
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={checkAllowance}
                disabled={isLoading || !address}
              >
                Check Allowance
              </button>
            </div>
          </>
        )}

        {/* Transfer From Tab */}
        {activeTab === 'transfer' && (
          <>
            <div className="form-group">
              <input 
                className="form-input"
                placeholder="From address (token owner, 0x...)" 
                value={fromAddress} 
                onChange={e => setFromAddress(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <input 
                className="form-input"
                placeholder="To address (recipient, 0x...)" 
                value={toAddress} 
                onChange={e => setToAddress(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <input 
                className="form-input"
                placeholder="Amount to transfer" 
                value={transferAmount} 
                onChange={e => setTransferAmount(e.target.value)} 
              />
            </div>

            <div className="button-group">
              <button 
                className="btn btn-primary" 
                onClick={transferFrom}
                disabled={isLoading || !address}
              >
                {isLoading ? <span className="loading-spinner"></span> : null}
                Execute Transfer
              </button>
            </div>

            <div className="transfer-info">
              <p><strong>Note:</strong> You must have sufficient allowance from the 'From' address to execute this transfer.</p>
            </div>
          </>
        )}

        {/* Transfer History Tab */}
        {activeTab === 'history' && (
          <div className="history-section">
            <div className="history-controls">
              <div className="history-source-toggle">
                <button 
                  className={`source-btn ${historySource === 'local' ? 'active' : ''}`}
                  onClick={() => setHistorySource('local')}
                >
                  Local History ({transferHistory.length})
                </button>
                <button 
                  className={`source-btn ${historySource === 'blockchain' ? 'active' : ''}`}
                  onClick={() => setHistorySource('blockchain')}
                >
                  Blockchain History ({blockchainHistory.length})
                </button>
              </div>
              
              <div className="history-actions">
                {historySource === 'blockchain' && (
                  <button 
                    className="btn btn-primary" 
                    onClick={fetchBlockchainHistory}
                    disabled={isLoadingHistory || !token}
                  >
                    {isLoadingHistory ? <span className="loading-spinner"></span> : null}
                    Fetch from Network
                  </button>
                )}
                {getCurrentHistory().length > 0 && (
                  <button className="btn btn-secondary" onClick={clearHistory}>
                    Clear {historySource === 'local' ? 'Local' : 'View'}
                  </button>
                )}
              </div>
            </div>
            
            {getCurrentHistory().length === 0 ? (
              <div className="empty-history">
                {historySource === 'local' ? (
                  <p>No local transfer history. Execute transferFrom transactions through this app to see them here.</p>
                ) : (
                  <p>No blockchain history loaded. Click "Fetch from Network" to load recent Transfer events from the blockchain.</p>
                )}
              </div>
            ) : (
              <div className="history-list">
                {getCurrentHistory().map((transfer) => (
                  <div key={transfer.id} className="history-item">
                    <div className="history-item-header">
                      <span className="history-token">{transfer.tokenName} ({transfer.tokenSymbol})</span>
                      <div className="history-badges">
                        {transfer.isTransferFrom && (
                          <span className="transfer-badge">transferFrom</span>
                        )}
                        <span className={`source-badge ${transfer.source}`}>
                          {transfer.source === 'blockchain' ? '🌐' : '📱'}
                        </span>
                        <span className="history-date">{formatDate(transfer.timestamp)}</span>
                      </div>
                    </div>
                    <div className="history-details">
                      <div className="transfer-flow">
                        <span className="address">{shortenAddress(transfer.from)}</span>
                        <span className="arrow">→</span>
                        <span className="address">{shortenAddress(transfer.to)}</span>
                        <span className="amount">{parseFloat(transfer.amount).toFixed(4)} {transfer.tokenSymbol}</span>
                      </div>
                      {transfer.spender && (
                        <div className="spender-info">
                          <span>Spender: {shortenAddress(transfer.spender)}</span>
                        </div>
                      )}
                      <div className="history-meta">
                        <span>Block: {transfer.blockNumber}</span>
                        <span>Gas: {parseInt(transfer.gasUsed).toLocaleString()}</span>
                        <a 
                          href={`https://etherscan.io/tx/${transfer.txHash}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="tx-link"
                        >
                          View on Etherscan
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {status && (
          <div className={`status-message ${getStatusClass()}`}>
            {(isLoading || isLoadingHistory) && <span className="loading-spinner"></span>}
            {status}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
