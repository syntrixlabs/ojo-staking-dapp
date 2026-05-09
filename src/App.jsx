import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import OjoStakingABI from "./OjoStaking.json";
import "./App.css";

// ─── PASTE YOUR DEPLOYED CONTRACT ADDRESS HERE AFTER REMIX DEPLOY ───────────
const CONTRACT_ADDRESS = "0x9E168D480B75A63e1C55e99c954876B75e8fF756";
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [stakeAmount, setStakeAmount] = useState("");

  const [stakeInfo, setStakeInfo] = useState({
    amount: "0",
    pendingReward: "0",
    isActive: false,
    stakeDuration: 0,
  });

  const [stats, setStats] = useState({
    totalStaked: "0",
    rewardPool: "0",
    totalStakers: "0",
    rewardRate: "0",
  });

  const fmt = (val, decimals = 6) =>
    parseFloat(ethers.formatEther(val)).toFixed(decimals);

  const fmtDuration = (secs) => {
    const s = Number(secs);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  };

  const shortAddr = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  const setStatus = (type, msg) => {
    setTxStatus({ type, msg });
    if (type !== "pending") setTimeout(() => setTxStatus(null), 5000);
  };

  const loadData = useCallback(async (ct, acct) => {
    try {
      const [info, statsData, ownerAddr] = await Promise.all([
        ct.getStakeInfo(acct),
        ct.getContractStats(),
        ct.owner(),
      ]);
      setStakeInfo({
        amount: fmt(info.amount),
        pendingReward: fmt(info.pendingReward, 8),
        isActive: info.isActive,
        stakeDuration: info.stakeDuration,
      });
      setStats({
        totalStaked: fmt(statsData._totalStaked),
        rewardPool: fmt(statsData._rewardPool),
        totalStakers: statsData._totalStakers.toString(),
        rewardRate: (Number(statsData._rewardRatePerDay) / 100).toFixed(2),
      });
      setIsOwner(ownerAddr.toLowerCase() === acct.toLowerCase());
    } catch (err) {
      console.error("Load data error:", err);
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus("error", "MetaMask not found. Please install it.");
      return;
    }
    try {
      setLoading(true);
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await _provider.send("eth_requestAccounts", []);
      const network = await _provider.getNetwork();
      const chainHex = "0x" + Number(network.chainId).toString(16);

      if (chainHex !== SEPOLIA_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SEPOLIA_CHAIN_ID }],
          });
        } catch {
          setStatus("error", "Please switch MetaMask to Sepolia testnet.");
          setLoading(false);
          return;
        }
      }

      const _signer = await _provider.getSigner();
      const _contract = new ethers.Contract(CONTRACT_ADDRESS, OjoStakingABI, _signer);

      setProvider(_provider);
      setSigner(_signer);
      setContract(_contract);
      setAccount(accounts[0]);

      await loadData(_contract, accounts[0]);
      setStatus("success", "Wallet connected!");
    } catch (err) {
      setStatus("error", "Connection failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStake = async () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      setStatus("error", "Enter a valid amount.");
      return;
    }
    try {
      setLoading(true);
      setStatus("pending", "Confirm the transaction in MetaMask...");
      const tx = await contract.stake({ value: ethers.parseEther(stakeAmount) });
      await tx.wait();
      setStakeAmount("");
      await loadData(contract, account);
      setStatus("success", `Successfully staked ${stakeAmount} ETH!`);
    } catch (err) {
      setStatus("error", err.reason || err.message || "Stake failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUnstake = async () => {
    try {
      setLoading(true);
      setStatus("pending", "Confirm unstake in MetaMask...");
      const tx = await contract.unstake();
      await tx.wait();
      await loadData(contract, account);
      setStatus("success", "Unstaked! ETH + rewards sent to your wallet.");
    } catch (err) {
      setStatus("error", err.reason || err.message || "Unstake failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    try {
      setLoading(true);
      setStatus("pending", "Claiming rewards...");
      const tx = await contract.claimRewards();
      await tx.wait();
      await loadData(contract, account);
      setStatus("success", "Rewards claimed successfully!");
    } catch (err) {
      setStatus("error", err.reason || err.message || "Claim failed");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    try {
      setLoading(true);
      setStatus("pending", "Withdrawing excess ETH...");
      const tx = await contract.withdrawExcess();
      await tx.wait();
      await loadData(contract, account);
      setStatus("success", "Withdrawn to owner wallet.");
    } catch (err) {
      setStatus("error", err.reason || err.message || "Withdraw failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!contract || !account) return;
    const interval = setInterval(() => loadData(contract, account), 10000);
    return () => clearInterval(interval);
  }, [contract, account, loadData]);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
    return () => {
      window.ethereum.removeAllListeners("accountsChanged");
      window.ethereum.removeAllListeners("chainChanged");
    };
  }, []);

  return (
    <div className="app">
      <div className="bg-grid" />
      <div className="bg-glow" />

      <header className="header">
        <div className="logo">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">OJO<span className="logo-accent">STAKE</span></span>
        </div>
        <div className="header-right">
          {account ? (
            <div className="wallet-badge">
              <span className="wallet-dot" />
              <span>{shortAddr(account)}</span>
              <span className="network-tag">Sepolia</span>
            </div>
          ) : (
            <button className="btn-connect" onClick={connectWallet} disabled={loading}>
              {loading ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {txStatus && (
        <div className={`status-bar status-${txStatus.type}`}>
          <span className="status-icon">
            {txStatus.type === "success" ? "✓" : txStatus.type === "error" ? "✕" : "⟳"}
          </span>
          {txStatus.msg}
        </div>
      )}

      <main className="main">
        <section className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Total Staked</div>
            <div className="stat-value">{stats.totalStaked} <span className="stat-unit">ETH</span></div>
          </div>
          <div className="stat-card stat-card--accent">
            <div className="stat-label">Reward Rate</div>
            <div className="stat-value">{stats.rewardRate}<span className="stat-unit">% / day</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Reward Pool</div>
            <div className="stat-value">{stats.rewardPool} <span className="stat-unit">ETH</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Stakers</div>
            <div className="stat-value">{stats.totalStakers}</div>
          </div>
        </section>

        {!account ? (
          <div className="connect-prompt">
            <div className="connect-icon">⬡</div>
            <h2>Start Earning ETH Rewards</h2>
            <p>Connect your MetaMask wallet to stake ETH and earn 1% daily rewards on Sepolia testnet.</p>
            <button className="btn-primary btn-large" onClick={connectWallet} disabled={loading}>
              {loading ? "Connecting..." : "Connect Wallet to Begin"}
            </button>
            <div className="connect-note">⚠ Switch MetaMask to Sepolia Testnet first</div>
          </div>
        ) : (
          <div className="dashboard">
            <div className="panel panel--main">
              <div className="panel-header">
                <h2>Your Position</h2>
                {stakeInfo.isActive && <span className="active-badge">● ACTIVE</span>}
              </div>

              {stakeInfo.isActive ? (
                <div className="stake-info">
                  <div className="info-row">
                    <span className="info-label">Staked Amount</span>
                    <span className="info-value">{stakeInfo.amount} ETH</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Time Staked</span>
                    <span className="info-value">{fmtDuration(stakeInfo.stakeDuration)}</span>
                  </div>
                  <div className="info-row reward-row">
                    <span className="info-label">Pending Rewards</span>
                    <span className="info-value reward-value">+{stakeInfo.pendingReward} ETH</span>
                  </div>
                  <div className="action-buttons">
                    <button className="btn-primary" onClick={handleClaim}
                      disabled={loading || parseFloat(stakeInfo.pendingReward) <= 0}>
                      Claim Rewards
                    </button>
                    <button className="btn-danger" onClick={handleUnstake} disabled={loading}>
                      Unstake + Claim All
                    </button>
                  </div>
                </div>
              ) : (
                <div className="no-stake">
                  <div className="no-stake-icon">○</div>
                  <p>No active stake found.</p>
                  <p className="no-stake-sub">Stake ETH below to start earning daily rewards.</p>
                </div>
              )}
            </div>

            {!stakeInfo.isActive && (
              <div className="panel panel--stake">
                <div className="panel-header">
                  <h2>Stake ETH</h2>
                </div>
                <div className="stake-form">
                  <div className="input-group">
                    <input type="number" className="stake-input" placeholder="0.001"
                      min="0.001" step="0.001" value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)} disabled={loading} />
                    <span className="input-suffix">ETH</span>
                  </div>
                  <div className="quick-amounts">
                    {["0.01", "0.05", "0.1", "0.5"].map((amt) => (
                      <button key={amt} className="quick-btn" onClick={() => setStakeAmount(amt)}>
                        {amt}
                      </button>
                    ))}
                  </div>
                  {stakeAmount && parseFloat(stakeAmount) > 0 && (
                    <div className="stake-preview">
                      <div className="preview-row">
                        <span>Daily reward</span>
                        <span>+{(parseFloat(stakeAmount) * 0.01).toFixed(6)} ETH</span>
                      </div>
                      <div className="preview-row">
                        <span>Weekly reward</span>
                        <span>+{(parseFloat(stakeAmount) * 0.07).toFixed(6)} ETH</span>
                      </div>
                    </div>
                  )}
                  <button className="btn-primary btn-full" onClick={handleStake}
                    disabled={loading || !stakeAmount}>
                    {loading ? "Processing..." : `Stake ${stakeAmount || "0"} ETH`}
                  </button>
                  <div className="stake-note">Min 0.001 ETH · 1% daily rewards · Withdraw anytime</div>
                </div>
              </div>
            )}

            {isOwner && (
              <div className="panel panel--owner">
                <div className="panel-header">
                  <h2>⚙ Owner Panel</h2>
                  <span className="owner-badge">ADMIN</span>
                </div>
                <p className="owner-desc">Only visible to the contract deployer wallet.</p>
                <button className="btn-owner" onClick={handleWithdraw} disabled={loading}>
                  Withdraw Excess ETH
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <span>OjoStake · Sepolia Testnet</span>
        <span className="footer-sep">·</span>
        <span>Contract: {CONTRACT_ADDRESS !== "0xYOUR_CONTRACT_ADDRESS_HERE"
          ? shortAddr(CONTRACT_ADDRESS) : "Not yet deployed"}</span>
        <span className="footer-sep">·</span>
        <span>All Right Reserved</span>
      </footer>
    </div>
  );
}
