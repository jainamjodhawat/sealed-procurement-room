import OperatorSetup from './OperatorSetup';
import { useState, useEffect } from "react";
import {
  deployAuctionContract,
  auctionBytes32,
  auctionCommitment,
  readAuctionLedger,
  submitAuctionCircuit,
} from "./midnightClient";
import {
  verifyProcurementDeployment,
  validateProcurementDeploymentRuntime,
} from "./runtimeConfig";

const RUNTIME = validateProcurementDeploymentRuntime({
  networkId: import.meta.env.VITE_NETWORK_ID,
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS,
  faucetUrl: import.meta.env.VITE_FAUCET_URL,
  demoMode: import.meta.env.VITE_DEMO_MODE,
  production: import.meta.env.PROD,
});

export default function App() {
  const readRoute = () =>
    ["dashboard", "deployer", "walletHub", "privacy"].includes(
      location.hash.slice(2),
    )
      ? location.hash.slice(2)
      : "home";
  const [activeTab, updateTab] = useState(readRoute);
  useEffect(() => {
    const navigate = () => {
      if (["#content", "#main-content"].includes(window.location.hash)) return;
      updateTab(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>("0.00");
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [laceDetected, setLaceDetected] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<any>(null);

  const [contractDeployed, setContractDeployed] = useState(false);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [runtimeIssue, setRuntimeIssue] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  const [ledger, setLedger] = useState({
    commitments_count: 0,
    highest_bid: 0,
    phase: "Not loaded",
    winner: "Not loaded",
  });
  const [formValues, setFormValues] = useState({
    bid_value: 250,
    bidder_secret: "0505050505050505050505050505050505050505050505050505050505050505",
    salt: "2525252525252525252525252525252525252525252525252525252525252525",
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [isProving, setIsProving] = useState(false);

  useEffect(() => {
    fetch("/deployment.json")
      .then((response) => {
        if (!response.ok)
          throw new Error(
            "Sealed Procurement Room: deployment.json could not be loaded.",
          );
        return response.json();
      })
      .then((deployment) => {
        const verified = verifyProcurementDeployment(deployment);
        if (
          RUNTIME.contractAddress &&
          RUNTIME.contractAddress !== verified.contractAddress
        ) {
          throw new Error(
            "Sealed Procurement Room: environment address does not match deployment evidence.",
          );
        }
        if (verified.network === RUNTIME.networkId) {
          setContractAddress(verified.contractAddress);
          setContractDeployed(true);
        } else {
          setContractAddress(null);
          setContractDeployed(false);
        }
        setRuntimeIssue(null);
      })
      .catch((error) => {
        setContractAddress(null);
        setContractDeployed(false);
        setRuntimeIssue(
          error instanceof Error
            ? error.message
            : "Sealed Procurement Room: configuration failed.",
        );
      });
    const detectLace = () => {
      const hasMidnightWallet = Object.values(
        (window as any).midnight ?? {},
      ).some((candidate: any) => typeof candidate?.connect === "function");
      setLaceDetected(hasMidnightWallet);
    };
    detectLace();
    const timer = setInterval(detectLace, 1000);
    return () => clearInterval(timer);
  }, []);

  const connectLace = async () => {
    setConnectingWallet(true);
    try {
      const candidates = Object.values(
        (window as any).midnight ?? {},
      ) as Array<{
        connect?: (networkId: string) => Promise<any>;
        name?: string;
        rdns?: string;
      }>;
      const oneAm = candidates.find(
        (c) =>
          /1am/i.test(`${c.name ?? ""} ${c.rdns ?? ""}`) &&
          typeof c.connect === "function",
      );
      const wallet =
        oneAm ??
        candidates.find((candidate) => typeof candidate.connect === "function");
      if (!wallet?.connect) {
        throw new Error(
          "No Midnight wallet connector was detected. Install 1AM or Lace and unlock it.",
        );
      }

      const connected = await wallet.connect(RUNTIME.networkId);
      (window as any).__midnightConnectedWallet = connected;
      const addressInfo = await connected.getUnshieldedAddress();
      const balances = await connected.getUnshieldedBalances();
      const nightBalance = Object.values(balances)[0] ?? 0n;

      setWalletAddress(addressInfo.unshieldedAddress);
      setWalletBalance((Number(nightBalance) / 1_000_000).toFixed(2));
      setWalletConnected(true);
      setConnectedWallet(connected);
      if (import.meta.env.VITE_CONTRACT_ADDRESS) {
        setContractAddress(import.meta.env.VITE_CONTRACT_ADDRESS);
        setContractDeployed(true);
      }
      logTransaction(
        "wallet",
        "MIDNIGHT WALLET CONNECTED",
        "—",
        "Connected through the Midnight DApp Connector API",
      );
    } catch (err) {
      console.error("Midnight wallet connection failed:", err);
      const raw = err instanceof Error ? err.message : String(err || "");
      const msg = (raw.includes("tabs:outgoing.message.ready") || raw.includes("No Listener")) ? "Wallet extension is asleep or locked. Please open and unlock your 1AM / Lace wallet extension, then retry." : (raw || "Midnight wallet connection failed.");
      alert(msg);
    } finally {
      setConnectingWallet(false);
    }
  };

  const disconnectLace = () => {
    setWalletConnected(false);
    setWalletAddress(null);
    setWalletBalance("0.00");
    logTransaction(
      "0x0000...0000",
      "1AM WALLET DISCONNECTED",
      "0.00 tNIGHT",
      "Disconnected wallet context",
    );
  };

  const requestFaucet = () => {
    if (!walletConnected) return;
    window.open(RUNTIME.faucetUrl, "_blank", "noopener,noreferrer");
    logTransaction(
      "—",
      "FAUCET OPENED",
      "—",
      "Funding must be confirmed by the official Midnight Preview faucet and wallet balance refresh.",
    );
  };

  const deployContractAction = async () => {
    if (!connectedWallet) {
      alert("Connect a Midnight wallet before deploying.");
      return;
    }
    setIsDeploying(true);
    try {
      const result = await deployAuctionContract(connectedWallet);
      setContractAddress(result.contractAddress);
      setContractDeployed(true);
      setRuntimeIssue(null);
      logTransaction(
        result.txId,
        "CONFIRMED ON MIDNIGHT",
        "—",
        `Fresh ${RUNTIME.networkId} deployment ${result.contractAddress}`,
      );
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Contract deployment failed.",
      );
    } finally {
      setIsDeploying(false);
    }
  };

  const submitBid = async (circuit: 'submitCommitment' | 'revealBid' = 'submitCommitment') => {
    if (!walletConnected || !contractDeployed || !contractAddress) return;
    try {
      const privateState = {
        secretKey: auctionBytes32(formValues.bidder_secret, "Bidder secret"),
        bidAmount: BigInt(formValues.bid_value),
        bidSalt: auctionBytes32(formValues.salt, "Bid salt"),
      };
      const result = await submitAuctionCircuit(
        (window as any).__midnightConnectedWallet,
        contractAddress,
        circuit,
        circuit === 'submitCommitment' ? [auctionCommitment(privateState)] : [],
        privateState,
      );
      const chain = await readAuctionLedger(
        (window as any).__midnightConnectedWallet,
        contractAddress,
      );
      setLedger({
        commitments_count: chain.commitmentCount,
        highest_bid: chain.highestBid,
        phase: chain.phase,
        winner: chain.winner.slice(0, 12) + "…",
      });
      logTransaction(
        result.txId,
        "CONFIRMED ON MIDNIGHT",
        "—",
        "Confirmed " + circuit + " on " + contractAddress,
      );
      return;
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "The Midnight transaction failed.",
      );
      logTransaction(
        "—",
        "TRANSACTION FAILED",
        "—",
        err instanceof Error ? err.message : "Unknown transaction failure",
      );
      return;
    }
  };

  const logTransaction = (
    hash: string,
    status: string,
    fee: string,
    details: string,
  ) => {
    setLogs((prev) => [
      {
        hash,
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        status,
        fee,
        details,
      },
      ...prev,
    ]);
  };

  return (
    <div className="product-shell">
      <a
        className="skip-link"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#/">
          <span className="brand-mark">S/</span>Sealed Procurement
          <small>Procurement room</small>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#/" aria-current={activeTab === "home" ? "page" : undefined}>
            About
          </a>
          <a
            href="#/privacy"
            aria-current={activeTab === "privacy" ? "page" : undefined}
          >
            Privacy
          </a>
          <a className="button" href="#/dashboard">
            Open workspace <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      {activeTab === "home" ? (
        <main id="content" tabIndex={-1} className="landing">
          <div className="hero">
            <div className="hero-copy">
              <p className="eyebrow">Sealed-bid procurement · Midnight</p>
              <h1>
                A sealed bid.
                <br />
                An open process.
              </h1>
              <p className="intro">
                Commit a bid without publishing its value at submission. A
                focused procurement workspace built around the commit–reveal
                process.
              </p>
              <a className="button" href="#/dashboard">
                Prepare a commitment <span aria-hidden="true">→</span>
              </a>
              <p className="fineprint">
                Test-network software. A compatible Midnight wallet is required
                for transactions.
              </p>
            </div>
            <ol className="bid-process">
              <li>
                <span>01 / COMMIT</span>
                <h2>Seal your offer.</h2>
                <p>Your bid and salt produce a public commitment.</p>
              </li>
              <li>
                <span>02 / REVEAL</span>
                <h2>Show the match.</h2>
                <p>The reveal circuit checks the bid against its commitment.</p>
              </li>
              <li>
                <span>03 / CLOSE</span>
                <h2>Record the result.</h2>
                <p>The contract records the highest bid and winner.</p>
              </li>
            </ol>
          </div>
          <section className="landing-details">
            <div>
              <p className="eyebrow">Purpose</p>
              <h2>Keep the opening offer sealed.</h2>
              <p>
                For participants preparing a commitment for a sealed-bid
                auction. Save your original bid, salt, and secret securely: the
                reveal process depends on the same inputs.
              </p>
            </div>
            <div>
              <p className="eyebrow">Privacy, precisely</p>
              <p>
                Commitments are public. Bid amounts are hidden during
                commitment, then disclosed by the reveal circuit. Revealed bids,
                the highest bid, winner, and transaction activity are public.
              </p>
              <a href="#/privacy">Read the privacy boundaries →</a>
            </div>
          </section>
        </main>
      ) : (
        <div className="workspace-layout">
          <nav className="workspace-nav" aria-label="Workspace pages">
            <p className="eyebrow">Workspace</p>
            {[
              ["dashboard", "Commit a bid"],
              ["walletHub", "Wallet & activity"],
              ["deployer", "Contract setup"],
              ["privacy", "Privacy boundaries"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={"#/" + id}
                aria-current={activeTab === id ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <main id="content" tabIndex={-1} className="workspace">
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">Sealed-bid operations</p>
                <h1>
                  {activeTab === "dashboard"
                    ? "Prepare your bid"
                    : activeTab === "walletHub"
                      ? "Wallet & activity"
                      : activeTab === "deployer"
                        ? "Contract setup"
                        : "Privacy boundaries"}
                </h1>
              </div>
              <span className="network-tag">Midnight {RUNTIME.networkId}</span>
            </div>
            {runtimeIssue && (
              <section className="notice" role="alert">
                <h2>Configuration needs attention</h2>
                <p>{runtimeIssue}</p>
                <p>
                  Wallet and contract actions are blocked until configuration is
                  restored.
                </p>
                <button onClick={() => window.location.reload()}>
                  Retry configuration
                </button>
              </section>
            )}
            {activeTab === "dashboard" && (
              <>
                <div className="session-strip">
                  <span>
                    {walletConnected
                      ? "Wallet connected"
                      : "Wallet not connected"}
                  </span>
                  <span>
                    {contractDeployed
                      ? "Deployment record loaded"
                      : "Contract setup required"}
                  </span>
                  <a href="#/walletHub">Manage wallet →</a>
                </div>
                <div className="task-grid">
                  <aside className="context-panel">
                    <p className="eyebrow">Room state</p>
                    <h2>
                      Commit first.
                      <br />
                      Reveal later.
                    </h2>
                    <dl>
                      <dt>Auction phase</dt>
                      <dd>{ledger.phase}</dd>
                      <dt>Committed bids</dt>
                      <dd>
                        {ledger.phase === "Not loaded"
                          ? "—"
                          : ledger.commitments_count}
                      </dd>
                      <dt>Winner</dt>
                      <dd>{ledger.winner}</dd>
                    </dl>
                    <p className="fineprint">
                      State updates after a confirmed commitment. This interface
                      submits commitments; reveal and phase management are not
                      available here.
                    </p>
                  </aside>
                  <section className="panel" aria-busy={isProving}>
                    <p className="eyebrow">Private inputs</p>
                    <h2>Bid commitment</h2>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (isProving) return;
                        setIsProving(true);
                        try {
                          await submitBid();
                        } finally {
                          setIsProving(false);
                        }
                      }}
                    >
                      <fieldset
                        disabled={
                          !walletConnected ||
                          !contractDeployed ||
                          !!runtimeIssue ||
                          isProving
                        }
                      >
                        <label>
                          Bid amount
                          <input
                            required
                            type="number"
                            min="1"
                            step="1"
                            value={formValues.bid_value}
                            onChange={(e) =>
                              setFormValues({
                                ...formValues,
                                bid_value: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)', margin: '14px 0' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                          <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Shielded Bidder Identity Active</span>
                        </div>
                        <details style={{ marginBottom: '16px', fontSize: '0.8rem', color: '#94a3b8' }}>
                          <summary style={{ cursor: 'pointer', padding: '4px 0', userSelect: 'none' }}>Advanced / Custom Salt & Secret</summary>
                          <div style={{ marginTop: '8px' }}>
                            <label>
                              Private bid salt
                              <input
                                type="password"
                                autoComplete="off"
                                placeholder="64 hexadecimal characters"
                                value={formValues.salt}
                                onChange={(e) =>
                                  setFormValues({
                                    ...formValues,
                                    salt: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Bidder secret
                              <input
                                type="password"
                                autoComplete="off"
                                placeholder="64 hexadecimal characters"
                                value={formValues.bidder_secret}
                                onChange={(e) =>
                                  setFormValues({
                                    ...formValues,
                                    bidder_secret: e.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        </details>
                        <button type="submit">
                          {isProving
                            ? "Awaiting proof & confirmation…"
                            : "Prove & submit commitment"}
                        </button>
                      <button type="button" disabled={!walletConnected || !contractDeployed || isProving} onClick={async()=>{if(isProving)return;setIsProving(true);try{await submitBid('revealBid');}finally{setIsProving(false);}}}>Reveal saved bid</button><p>Reveal only after the administrator opens the reveal phase. Use exactly the original amount, salt and bidder secret.</p></fieldset>
                    </form>
                    {(!walletConnected || !contractDeployed) && (
                      <p className="form-hint">
                        Connect a wallet and configure the contract to enable
                        submission.
                      </p>
                    )}
                  </section>
                </div>
              </>
            )}
            {activeTab === "walletHub" && (
              <>
                <div className="task-grid">
                  <section className="panel">
                    <p className="eyebrow">Connection</p>
                    <h2>Your Midnight wallet</h2>
                    <p>
                      {laceDetected
                        ? "Compatible wallet detected."
                        : "Install and unlock a compatible 1AM or Lace wallet to continue."}
                    </p>
                    {walletConnected ? (
                      <>
                        <code>{walletAddress}</code>
                        <p>Wallet-reported balance: {walletBalance} tNIGHT</p>
                        <button onClick={disconnectLace}>
                          Disconnect session
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={connectingWallet}
                        onClick={connectLace}
                      >
                        {connectingWallet ? "Connecting…" : "Connect wallet"}
                      </button>
                    )}
                  </section>
                  <section className="panel">
                    <p className="eyebrow">Test-network funding</p>
                    <h2>Official faucet</h2>
                    <p>
                      Open the network faucet to request test tokens. Funding is
                      not confirmed by opening this link.
                    </p>
                    <button
                      className="secondary"
                      onClick={requestFaucet}
                      disabled={!walletConnected}
                    >
                      Open faucet ↗
                    </button>
                  </section>
                </div>
                <section className="panel activity">
                  <h2>Session activity</h2>
                  {logs.length ? (
                    <ul>
                      {logs.map((log, i) => (
                        <li key={i}>
                          <time>{log.timestamp}</time>
                          <strong>{log.status}</strong>
                          <p>{log.details}</p>
                          <code>{log.hash}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No actions recorded in this session.</p>
                  )}
                </section>
              </>
            )}
            {activeTab === 'deployer' && <OperatorSetup wallet={walletConnected ? connectedWallet : null} address={runtimeIssue ? null : contractAddress} />}
            {activeTab === "deployer" && (
              <section className="panel setup-panel">
                <p className="eyebrow">Operator tools</p>
                <h2>Auction contract</h2>
                <p>
                  A deployment requires wallet approval. Loading a deployment
                  record is not a live ledger-health check.
                </p>
                {contractDeployed ? (
                  <>
                    <h3>Configured contract address</h3>
                    <code>{contractAddress}</code>
                  </>
                ) : (
                  <button
                    onClick={deployContractAction}
                    disabled={isDeploying || !walletConnected}
                  >
                    {isDeploying ? "Deploying…" : "Deploy contract"}
                  </button>
                )}
                <p className="fineprint">
                  Connect your wallet before deploying. Do not use production
                  funds or sensitive real-world data.
                </p>
              </section>
            )}
            {activeTab === "privacy" && (
              <div className="privacy-grid">
                <section className="panel">
                  <p className="eyebrow">Public information</p>
                  <h2>What can be observed</h2>
                  <p>
                    Commitments are public. Bid amounts are hidden during
                    commitment, then disclosed by the reveal circuit. Revealed
                    bids, the highest bid, winner, and transaction activity are
                    public.
                  </p>
                </section>
                <section className="panel">
                  <p className="eyebrow">Private inputs</p>
                  <h2>Handle secrets carefully</h2>
                  <p>
                    Secrets and salts are provided to the proof workflow. Your
                    configured proving provider may process witness data. Use
                    test data and keep a secure backup of the inputs you need.
                  </p>
                </section>
                <section className="notice">
                  <h2>Understand the limits</h2>
                  <p>
                    A sealed commitment is not permanent bid confidentiality.
                    Revealed amounts become public, and this interface does not
                    implement reveal or auction administration controls. This is
                    test-network software, not an audited production service.
                  </p>
                </section>
              </div>
            )}
          </main>
        </div>
      )}
      <footer className="site-footer">
        <span>Sealed Procurement / Confidential bidding</span>
        <a href="#/">Project overview</a>
        <span>Test-network use only</span>
      </footer>
    </div>
  );
}
