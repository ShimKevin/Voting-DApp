// Configuration
const network = "sepolia";
// Replace with your deployed contract address
const votingAddress = "0xa2c7e24B2a29Ece77CA02646556838145e9ae80b";
const abi = [
  "function vote(uint256 proposalId) external",
  "function proposals(uint256) view returns (string name, uint256 voteCount)",
  "function winningProposal() view returns (uint256)",
  "function winnerName() view returns (string)"
];
const infuraId = "aa768630b82a4bdeb6b3cafce8ac25e6";

// Application state
let provider;
let signer;
let txHistory = [];
let selectedProposal = 0; // IDs start at 0

// DOM Elements
const walletInfoEl = document.getElementById("wallet-info");
const statusEl = document.getElementById("status");
const txHistoryEl = document.getElementById("tx-history");
const sendToEl = document.getElementById("send-to");
const ethAmountEl = document.getElementById("eth-amount");
const winnerEl = document.getElementById("winner");

// Wallet Connection Functions
async function connectWallet() {
  try {
    if (!window.ethereum) {
      // Provide installation link
      setErrorStatus("MetaMask not detected! Install from <a href='https://metamask.io/' target='_blank'>metamask.io</a>");
      return;
    }
    
    setStatus(`<span class="status-loading"><i class="fas fa-spinner fa-spin"></i> Connecting to MetaMask...</span>`);
    
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    await updateWalletInfo();
    
    loadTxHistory();
    setStatus(`<span class="status-success"><i class="fas fa-check-circle"></i> MetaMask connected successfully!</span>`);
    
    // Load vote counts and winner
    await updateVoteCounts();
  } catch (err) {
    setErrorStatus(err.message);
  }
}

async function connectWalletConnect() {
  try {
    setStatus(`<span class="status-loading"><i class="fas fa-spinner fa-spin"></i> Connecting with WalletConnect...</span>`);
    
    const WalletConnectProvider = window.WalletConnectProvider.default;
    const wcProvider = new WalletConnectProvider({
      rpc: {
        11155111: `https://sepolia.infura.io/v3/${infuraId}`
      },
      chainId: 11155111,
      qrcodeModalOptions: {
        mobileLinks: ["metamask", "trust", "rainbow", "argent"]
      }
    });
    
    // Enable session (triggers QR code modal)
    await wcProvider.enable();
    
    provider = new ethers.BrowserProvider(wcProvider);
    signer = await provider.getSigner();
    await updateWalletInfo();
    
    loadTxHistory();
    setStatus(`<span class="status-success"><i class="fas fa-check-circle"></i> WalletConnect connected successfully!</span>`);
    
    // Load vote counts and winner
    await updateVoteCounts();
  } catch (err) {
    setErrorStatus("WalletConnect error: " + err.message);
  }
}

// Wallet Information
async function updateWalletInfo() {
  if (!signer) return;
  
  const address = await signer.getAddress();
  const balance = await provider.getBalance(address);
  const ethBalance = ethers.formatEther(balance);
  const networkInfo = await provider.getNetwork();
  
  walletInfoEl.innerHTML = `
    <div class="wallet-info">
      <div class="wallet-detail">
        <strong><i class="fas fa-user-circle"></i> Address</strong>
        <p>${truncateAddress(address)}</p>
      </div>
      <div class="wallet-detail">
        <strong><i class="fas fa-coins"></i> Balance</strong>
        <p>${parseFloat(ethBalance).toFixed(4)} ETH</p>
      </div>
      <div class="wallet-detail">
        <strong><i class="fas fa-network-wired"></i> Network</strong>
        <p>${networkInfo.name} (ID: ${networkInfo.chainId})</p>
      </div>
      <div class="wallet-detail">
        <strong><i class="fas fa-link"></i> Status</strong>
        <p><i class="fas fa-circle" style="color: #4CAF50"></i> Connected</p>
      </div>
    </div>
  `;
}

// Transaction Functions
async function sendETH() {
  const to = sendToEl.value;
  const amount = ethAmountEl.value;
  
  if (!signer) {
    setErrorStatus("Please connect your wallet first!");
    return;
  }
  
  if (!to || !ethers.isAddress(to)) {
    setErrorStatus("Please enter a valid recipient address!");
    return;
  }
  
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    setErrorStatus("Please enter a valid ETH amount!");
    return;
  }
  
  try {
    setStatus(`<span class="status-loading"><i class="fas fa-spinner fa-spin"></i> Sending ${amount} ETH to ${truncateAddress(to)}...</span>`);
    
    const tx = await signer.sendTransaction({
      to,
      value: ethers.parseEther(amount)
    });
    
    const receipt = await tx.wait();
    const entry = createTransactionEntry("send", {
      amount: amount,
      to: to,
      hash: tx.hash
    });
    
    setStatus(`<span class="status-success"><i class="fas fa-check-circle"></i> Sent ${amount} ETH to ${truncateAddress(to)}! ${createTxLink(tx.hash)}</span>`);
    
    txHistory.push(entry);
    updateTxList();
    await updateWalletInfo();
    
    // Clear form
    sendToEl.value = "";
    ethAmountEl.value = "";
  } catch (err) {
    setErrorStatus(err.message);
  }
}

function selectProposal(proposalId) {
  selectedProposal = proposalId;
  
  // Remove active class from all
  document.querySelectorAll('.proposal-card').forEach(card => {
    card.classList.remove('active');
  });
  
  // Add active class to selected
  document.querySelector(`.proposal-card[data-id="${proposalId}"]`).classList.add('active');
}

async function castVote() {
  if (!signer) {
    setErrorStatus("Please connect your wallet first!");
    return;
  }
  
  try {
    setStatus(`<span class="status-loading"><i class="fas fa-spinner fa-spin"></i> Casting your vote...</span>`);
    
    const contract = new ethers.Contract(votingAddress, abi, signer);
    const tx = await contract.vote(selectedProposal);
    
    const receipt = await tx.wait();
    const proposalName = await getProposalName(selectedProposal);
    const entry = createTransactionEntry("vote", {
      proposalId: selectedProposal,
      proposalName: proposalName,
      hash: tx.hash
    });
    
    setStatus(`<span class="status-success"><i class="fas fa-check-circle"></i> Voted successfully! ${createTxLink(tx.hash)}</span>`);
    
    txHistory.push(entry);
    updateTxList();
    
    // Refresh vote counts and winner
    await updateVoteCounts();
  } catch (err) {
    setErrorStatus("Voting error: " + err.message);
  }
}

// Vote Count Functions
async function updateVoteCounts() {
  if (!provider) return;
  
  try {
    const contract = new ethers.Contract(votingAddress, abi, provider);
    
    // Update proposal 0
    const proposal0 = await contract.proposals(0);
    document.querySelector('[data-id="0"] p').innerHTML = 
      `${proposal0.name} <br> <strong>Votes: ${proposal0.voteCount}</strong>`;
    
    // Update proposal 1
    const proposal1 = await contract.proposals(1);
    document.querySelector('[data-id="1"] p').innerHTML = 
      `${proposal1.name} <br> <strong>Votes: ${proposal1.voteCount}</strong>`;
    
    // Update winner
    const winner = await contract.winnerName();
    winnerEl.innerHTML = `
      <div class="winner-display">
        <i class="fas fa-trophy"></i>
        <h3>Current Winner: ${winner}</h3>
      </div>
      <div class="results-container">
        <div class="result-item">
          <span>${proposal0.name}</span>
          <span><strong>${proposal0.voteCount} votes</strong></span>
        </div>
        <div class="result-item">
          <span>${proposal1.name}</span>
          <span><strong>${proposal1.voteCount} votes</strong></span>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Error updating vote counts:", err);
  }
}

async function getProposalName(proposalId) {
  if (!provider) return `Proposal ${proposalId + 1}`;
  
  try {
    const contract = new ethers.Contract(votingAddress, abi, provider);
    const proposal = await contract.proposals(proposalId);
    return proposal.name;
  } catch (err) {
    return `Proposal ${proposalId + 1}`;
  }
}

// UI Helpers
function createTransactionEntry(type, data) {
  return {
    type: type,
    ...data,
    timestamp: new Date().toLocaleString()
  };
}

function createTxLink(hash) {
  return `<a class="tx-link" href="https://${network}.etherscan.io/tx/${hash}" target="_blank"><i class="fas fa-external-link-alt"></i></a>`;
}

function truncateAddress(address, start = 6, end = 4) {
  return `${address.substring(0, start)}...${address.substring(address.length - end)}`;
}

function setStatus(message) {
  statusEl.innerHTML = message;
}

function setErrorStatus(message) {
  statusEl.innerHTML = `<span class="status-error"><i class="fas fa-exclamation-triangle"></i> ${message}</span>`;
}

// Transaction History
function updateTxList() {
  txHistoryEl.innerHTML = "";
  
  if (txHistory.length === 0) {
    txHistoryEl.innerHTML = `
      <li class="empty-state">
        <i class="fas fa-clock"></i>
        <h3>No transactions yet</h3>
        <p>Your transactions will appear here</p>
      </li>
    `;
    return;
  }
  
  txHistory.slice().reverse().forEach(tx => {
    const li = document.createElement("li");
    li.className = "tx-entry";
    
    if (tx.type === "send") {
      li.innerHTML = `
        <div class="tx-icon">
          <i class="fas fa-paper-plane"></i>
        </div>
        <div class="tx-details">
          <h4>Sent ${tx.amount} ETH</h4>
          <div class="tx-meta">
            <span>To: ${truncateAddress(tx.to)}</span>
            <span>${tx.timestamp}</span>
          </div>
        </div>
        ${createTxLink(tx.hash)}
      `;
    } else if (tx.type === "vote") {
      li.innerHTML = `
        <div class="tx-icon tx-vote">
          <i class="fas fa-vote-yea"></i>
        </div>
        <div class="tx-details">
          <h4>Voted: ${tx.proposalName}</h4>
          <div class="tx-meta">
            <span>Proposal ID: ${tx.proposalId + 1}</span>
            <span>${tx.timestamp}</span>
          </div>
        </div>
        ${createTxLink(tx.hash)}
      `;
    }
    
    txHistoryEl.appendChild(li);
  });
  
  localStorage.setItem("txHistory", JSON.stringify(txHistory));
}

function loadTxHistory() {
  const stored = localStorage.getItem("txHistory");
  if (stored) {
    txHistory = JSON.parse(stored);
    updateTxList();
  }
}

// Theme Management
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute("data-theme");
  const newTheme = current === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", newTheme);
  
  const themeBtn = document.querySelector('.theme-toggle');
  themeBtn.innerHTML = newTheme === "dark" 
    ? '<i class="fas fa-sun"></i> Light Mode' 
    : '<i class="fas fa-moon"></i> Dark Mode';
}

// Initialize the app
async function initApp() {
  loadTxHistory();
  selectProposal(0);
  
  // Try to update vote counts if provider is available
  if (window.ethereum) {
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      await updateVoteCounts();
    } catch (err) {
      console.log("Couldn't connect to provider on init:", err);
    }
  }
}

// Start the application
window.addEventListener('DOMContentLoaded', initApp);