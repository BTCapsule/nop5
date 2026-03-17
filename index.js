const tunnelmole = require('tunnelmole/cjs');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const axios = require('axios');
const os = require('os');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');
const unzipper = require('unzipper');
const tar = require('tar');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json());
app.use(express.static(__dirname));





const pipelineAsync = promisify(pipeline);

const BIN_DIR = path.join(__dirname, 'bin');
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);



let GRPCURL_BIN;

function detectGrpcurlPath() {
  const platform = os.platform();

  if (platform === 'darwin') {
    return path.join(
      process.env.HOME,
      'Library',
      'Application Support',
      'bitwindow',
      'assets',
      'bin',
      'grpcurl'
    );
  } else if (platform === 'linux') {
    return path.join(
      process.env.HOME,
      '.local',
      'share',
      'bitwindow',
      'assets',
      'bin',
      'grpcurl'
    );
  } else if (platform === 'win32') {
    return path.join(BIN_DIR, 'grpcurl.exe');
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

function ensureGrpcurlExecutable() {
  const grpcPath = detectGrpcurlPath();

  if (!fs.existsSync(grpcPath)) {
    throw new Error(`grpcurl not found at ${grpcPath}`);
  }

  // Only needed for Unix systems
  if (os.platform() !== 'win32') {
    try {
      const stats = fs.statSync(grpcPath);

      // Check if executable bit is missing
      const isExecutable = (stats.mode & 0o111) !== 0;

      if (!isExecutable) {
        console.log('Fixing grpcurl permissions...');
        fs.chmodSync(grpcPath, 0o755);
      }
    } catch (err) {
      throw new Error(`Failed to set permissions on grpcurl: ${err.message}`);
    }
  }

  return grpcPath;
}

// Initialize once at startup
GRPCURL_BIN = ensureGrpcurlExecutable();

async function ensureGrpcurl() {
  GRPCURL_BIN = detectGrpcurlPath();

  if (fs.existsSync(GRPCURL_BIN)) {
    console.log('grpcurl found at', GRPCURL_BIN);
    return;
  }

  if (os.platform() === 'win32') {
    console.log('grpcurl not found on Windows. Downloading...');
    const url = 'https://github.com/fullstorydev/grpcurl/releases/latest/download/grpcurl_1.8.7_windows_x86_64.zip';
    const tmpFile = path.join(BIN_DIR, 'grpcurl.zip');
    const file = fs.createWriteStream(tmpFile);

    await new Promise((resolve, reject) => {
      https.get(url, res => {
        if (res.statusCode !== 200) return reject(new Error(`Download failed: ${res.statusCode}`));
        res.pipe(file);
        file.on('finish', () => { file.close(resolve); });
      }).on('error', reject);
    });

    await pipelineAsync(fs.createReadStream(tmpFile), unzipper.Extract({ path: BIN_DIR }));
    fs.unlinkSync(tmpFile);

    if (!fs.existsSync(GRPCURL_BIN)) {
      console.error('grpcurl binary not found after download.');
      process.exit(1);
    }

    console.log('grpcurl installed to', GRPCURL_BIN);
  } else {
    console.error(`grpcurl not found at expected Bitwindow path: ${GRPCURL_BIN}`);
    process.exit(1);
  }

  // Make sure binary is executable
  if (os.platform() !== 'win32') fs.chmodSync(GRPCURL_BIN, 0o755);
}

async function grpcCall(serviceMethod, requestBody = {}) {
  await ensureGrpcurl();

  return new Promise((resolve, reject) => {
    const jsonString = JSON.stringify(requestBody);
    const cmdArgs = ['-plaintext', '-d', jsonString, 'localhost:50051', serviceMethod];

    const proc = spawn(GRPCURL_BIN, cmdArgs);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => stdout += data.toString());
    proc.stderr.on('data', data => stderr += data.toString());

    proc.on('close', code => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout || '{}')); } 
        catch { resolve(stdout); }
      } else {
        reject(new Error(stderr || 'grpcurl error'));
      }
    });
  });
}

module.exports = { ensureGrpcurl, grpcCall };


/*
// --------- Tor Management ---------
// (still commented out)
*/

// --------- RPC ROUTES ---------
const rpcMap = {
  crypto: [
    'cusf.crypto.v1.CryptoService/HmacSha512',
    'cusf.crypto.v1.CryptoService/Ripemd160',
    'cusf.crypto.v1.CryptoService/Secp256k1SecretKeyToPublicKey',
    'cusf.crypto.v1.CryptoService/Secp256k1Sign',
    'cusf.crypto.v1.CryptoService/Secp256k1Verify',
  ],
  validator: [
    'cusf.mainchain.v1.ValidatorService/GetBlockHeaderInfo',
    'cusf.mainchain.v1.ValidatorService/GetBlockInfo',
    'cusf.mainchain.v1.ValidatorService/GetBmmHStarCommitment',
    'cusf.mainchain.v1.ValidatorService/GetChainInfo',
    'cusf.mainchain.v1.ValidatorService/GetChainTip',
    'cusf.mainchain.v1.ValidatorService/GetCoinbasePSBT',
    'cusf.mainchain.v1.ValidatorService/GetCtip',
    'cusf.mainchain.v1.ValidatorService/GetSidechainProposals',
    'cusf.mainchain.v1.ValidatorService/GetSidechains',
    'cusf.mainchain.v1.ValidatorService/GetTwoWayPegData',
    'cusf.mainchain.v1.ValidatorService/Stop',
    'cusf.mainchain.v1.ValidatorService/SubscribeEvents',
    'cusf.mainchain.v1.ValidatorService/SubscribeHeaderSyncProgress'
  ],
  wallet: [
    'cusf.mainchain.v1.WalletService/BroadcastWithdrawalBundle',
    'cusf.mainchain.v1.WalletService/CreateBmmCriticalDataTransaction',
    'cusf.mainchain.v1.WalletService/CreateDepositTransaction',
    'cusf.mainchain.v1.WalletService/CreateNewAddress',
    'cusf.mainchain.v1.WalletService/CreateSidechainProposal',
    'cusf.mainchain.v1.WalletService/CreateWallet',
    'cusf.mainchain.v1.WalletService/GenerateBlocks',
    'cusf.mainchain.v1.WalletService/GetBalance',
    'cusf.mainchain.v1.WalletService/GetInfo',
    'cusf.mainchain.v1.WalletService/ListSidechainDepositTransactions',
    'cusf.mainchain.v1.WalletService/ListTransactions',
    'cusf.mainchain.v1.WalletService/ListUnspentOutputs',
    'cusf.mainchain.v1.WalletService/SendTransaction',
    'cusf.mainchain.v1.WalletService/UnlockWallet'
  ]
};

// --------- Dynamic Route Creation ---------
for (const [category, methods] of Object.entries(rpcMap)) {
  methods.forEach(method => {
    const routeName = method.split('/')[1];
    app.post(`/${category}/${routeName}`, async (req, res) => {
      try {
        // Use request body directly, don't wrap in array
        const requestBody = req.body.args || req.body || {};

        const result = await grpcCall(method, requestBody);

        res.json({ result });
      } catch (err) {
        res.status(500).json({ error: err.toString() });
      }
    });
  });
}












app.post('/wallet/SendTransaction', async (req, res) => {
  try {
    const txRequest = req.body; // already { destinations, feeRate }
    console.log("Calling gRPC with:", JSON.stringify(txRequest, null, 2));

    const result = await grpcCall('cusf.mainchain.v1.WalletService/SendTransaction', txRequest);
    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});











// Dynamic proxy route for all Thunder methods
// Replace the existing app.post('/thunder/:method', …) block with this:

app.post('/thunder/:method', async (req, res) => {
  const { method } = req.params;

  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: method,           // ← "get_new_address", "balance", etc.
      params: req.body.params || req.body.args || [],   // allow both
    };

    console.log(`→ Thunder RPC [${method}]`, body);

    const response = await axios.post("http://127.0.0.1:6009", body, {
      headers: { "Content-Type": "application/json" }
    });

    const data = response.data;

    if (data.error) {
      console.warn("Thunder returned error:", data.error);
      return res.status(500).json(data);
    }

    console.log(`← Thunder [${method}]`, data.result);

    res.json({ result: data.result });   // keep same shape as your gRPC proxy
  } catch (err) {
    console.error(`Thunder proxy error [${method}]:`, err.message);
    res.status(502).json({ error: "Thunder backend not reachable" });
  }
});



// Dynamic proxy route for all coinshift methods
// Replace the existing app.post('/coinshift/:method', …) block with this:

app.post('/coinshift/:method', async (req, res) => {
  const { method } = req.params;

  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: method,           // ← "get_new_address", "balance", etc.
      params: req.body.params || req.body.args || [],   // allow both
    };

    console.log(`→ coinshift RPC [${method}]`, body);

    const response = await axios.post("http://127.0.0.1:6255", body, {
      headers: { "Content-Type": "application/json" }
    });

    const data = response.data;

    if (data.error) {
      console.warn("coinshift returned error:", data.error);
      return res.status(500).json(data);
    }

    console.log(`← coinshift [${method}]`, data.result);

    res.json({ result: data.result });   // keep same shape as your gRPC proxy
  } catch (err) {
    console.error(`coinshift proxy error [${method}]:`, err.message);
    res.status(502).json({ error: "coinshift backend not reachable" });
  }
});








// Dynamic proxy route for all zside methods
// Replace the existing app.post('/zside/:method', …) block with this:

app.post('/zside/:method', async (req, res) => {
  const { method } = req.params;

  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: method,           // ← "get_new_address", "balance", etc.
      params: req.body.params || req.body.args || [],   // allow both
    };

    console.log(`→ zside RPC [${method}]`, body);

    const response = await axios.post("http://127.0.0.1:6098", body, {
      headers: { "Content-Type": "application/json" }
    });

    const data = response.data;

    if (data.error) {
      console.warn("zside returned error:", data.error);
      return res.status(500).json(data);
    }

    console.log(`← zside [${method}]`, data.result);

    res.json({ result: data.result });   // keep same shape as your gRPC proxy
  } catch (err) {
    console.error(`zside proxy error [${method}]:`, err.message);
    res.status(502).json({ error: "zside backend not reachable" });
  }
});











// Dynamic proxy route for all bitassets methods
// Replace the existing app.post('/bitassets/:method', …) block with this:

app.post('/bitassets/:method', async (req, res) => {
  const { method } = req.params;

  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: method,           // ← "get_new_address", "balance", etc.
      params: req.body.params || req.body.args || [],   // allow both
    };

    console.log(`→ bitassets RPC [${method}]`, body);

    const response = await axios.post("http://127.0.0.1:6004", body, {
      headers: { "Content-Type": "application/json" }
    });

    const data = response.data;

    if (data.error) {
      console.warn("bitassets returned error:", data.error);
      return res.status(500).json(data);
    }

    console.log(`← bitassets [${method}]`, data.result);

    res.json({ result: data.result });   // keep same shape as your gRPC proxy
  } catch (err) {
    console.error(`bitassets proxy error [${method}]:`, err.message);
    res.status(502).json({ error: "bitassets backend not reachable" });
  }
});






// Dynamic proxy route for all bitnames methods
// Replace the existing app.post('/bitnames/:method', …) block with this:

app.post('/bitnames/:method', async (req, res) => {
  const { method } = req.params;

  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: method,           // ← "get_new_address", "balance", etc.
      params: req.body.params || req.body.args || [],   // allow both
    };

    console.log(`→ bitnames RPC [${method}]`, body);

    const response = await axios.post("http://127.0.0.1:6002", body, {
      headers: { "Content-Type": "application/json" }
    });

    const data = response.data;

    if (data.error) {
      console.warn("bitnames returned error:", data.error);
      return res.status(500).json(data);
    }

    console.log(`← bitnames [${method}]`, data.result);

    res.json({ result: data.result });   // keep same shape as your gRPC proxy
  } catch (err) {
    console.error(`bitnames proxy error [${method}]:`, err.message);
    res.status(502).json({ error: "bitnames backend not reachable" });
  }
});
















// --------- Serve Frontend ---------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --------- Start Server + Tunnelmole ---------
async function start() {
  try {
    await ensureGrpcurl(); // make sure binary is ready before routes are used
  } catch (err) {
    console.error('Failed to install grpcurl:', err);
    process.exit(1);
  }

  const webPort = 3000;

  app.listen(webPort, '127.0.0.1', async () => {
    console.log('Server running on port', webPort);

    const url = await tunnelmole({ port: webPort });
    console.log("Public URL:", url);

    const qr = await QRCode.toString(url, { type: 'terminal' });
    console.log(qr);
  });
}

start(); 