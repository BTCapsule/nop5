const QRCode = require('qrcode');
const opn = require('opn');
const fs = require('fs');
let express = require('express');
let cors = require('cors');
let app = express();
let testchain_rpc = require('node-bitcoin-rpc');
const path = require('path');
const tunnelmole = require('tunnelmole/cjs');
//const bip39 = require('bip39');
//const ecc = require('tiny-secp256k1');
//const { BIP32Factory } = require('bip32');
const bitcoin = require('bitcoinjs-lib');

const https = require('https');
const crypto = require('crypto');
const publicIp = require('ip');
const forge = require('node-forge');
//const bip32 = BIP32Factory(ecc);
const os = require('os');



app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));




function generateRandomNumber() {
  return Math.floor(Math.random() * 1000000); // Generates a random number between 0 and 999999
}



function generateSelfSignedCertificate() {
  const pki = forge.pki;
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [{
    name: 'commonName',
    value: 'localhost'
  }, {
    name: 'countryName',
    value: 'US'
  }, {
    shortName: 'ST',
    value: 'Virginia'
  }, {
    name: 'localityName',
    value: 'Blacksburg'
  }, {
    name: 'organizationName',
    value: 'Test'
  }, {
    shortName: 'OU',
    value: 'Test'
  }];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);
  return {
    cert: pki.certificateToPem(cert),
    privateKey: pki.privateKeyToPem(keys.privateKey)
  };
}


function getPublicIP() {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}









/*
let host = '127.0.0.1'
let user = 'user'
let pass = 'password'
let network;
let port;

if (process.argv.includes('-testnet')) {
 network = bitcoin.networks.testnet;
 port = 8272;
} else {
 network = bitcoin.networks.bitcoin;
 port = 8272;
}

testchain_rpc.init(host, port, user, pass)
testchain_rpc.setTimeout(30000) // 30 seconds
*/



function dynamicRPCCall(rpcType, method, params) {
  return new Promise((resolve, reject) => {
    const rpc = rpcType === 'bitcoin' ? bitcoin_rpc : testchain_rpc;
    const port = rpcType === 'bitcoin' ? 8332 : 8232;

    // Disconnect from current connection (if any)
    rpc.init('localhost', 0, 'user', 'password');

    // Connect to the appropriate port
    rpc.init('localhost', port, 'user', 'password');
    rpc.setTimeout(30000);

    rpc.call(method, params, function(err, response) {
      if (err) {
        reject(err);
      } else {
        resolve(response);
        rpc.init('localhost', 0, 'user', 'password');
      }
    });
  });
}



// In testchain.js

app.get('/api/getdepositaddress', function (req, res) {
  dynamicRPCCall('testchain', 'getdepositaddress', [])
    .then(rpcRes => {
      console.log(rpcRes);
      if (typeof rpcRes.result !== 'undefined') {
        res.send(JSON.stringify({address: rpcRes.result}));
      } else {
        res.status(500).send("No error and no result from test chain");
      }
    })
    .catch(err => {
      res.status(500).send({ error: "Test chain error:\n" + err });
    });
});

app.get('/api/listactivesidechains', function (req, res) {
  dynamicRPCCall('testchain', 'listactivesidechains', [])
    .then(rpcRes => {
      if (typeof rpcRes.result !== 'undefined') {
        res.send(JSON.stringify(rpcRes.result));
      } else {
        res.status(500).send("No error and no result ?");
      }
    })
    .catch(err => {
      res.status(500).send({ error: "Error: " + err });
    });
});

// Get the list of wallets
dynamicRPCCall('testchain', 'listwallets', [])
  .then(wallets => {
    // Get the most recently loaded wallet
    const mostRecentWalletName = wallets.result[wallets.result.length - 1];

    // Unload each wallet except for the most recently loaded one
    wallets.result.forEach(function(walletName) {
      if (walletName !== mostRecentWalletName) {
        dynamicRPCCall('testchain', 'unloadwallet', [walletName])
          .then(() => {
            console.log("Unloaded wallet:", walletName);
          })
          .catch(err => {
            console.error("Error unloading wallet:", err);
          });
      }
    });
  })
  .catch(err => {
    console.error("Error listing wallets:", err);
  });

app.get('/testchainRpc/:rpcMethod', function (req, res) {
  const rpcMethod = req.params.rpcMethod;
  console.log("api button");
  dynamicRPCCall('testchain', rpcMethod, [])
    .then(rpcRes => {
      if (typeof rpcRes.result !== 'undefined') {
        if (rpcMethod == 'getblockchaininfo' || rpcMethod == 'getwalletinfo') {
          console.log(rpcRes.result);
        }

        if (rpcMethod === 'listwallets') {
          const allWallets = rpcRes.result;

          // Check if the 'wallets.txt' file exists
          if (fs.existsSync('wallets.txt')) {
            // If the file exists, read its contents
            const existingWallets = fs.readFileSync('wallets.txt', 'utf8').split('\n');

            // Check if the new wallet names are already in the file
            const newWallets = allWallets.filter(wallet => !existingWallets.includes(wallet));

            // If there are new wallet names, write them to the file
            if (newWallets.length > 0) {
              const combinedWallets = [...existingWallets, ...newWallets];
              fs.writeFileSync('wallets.txt', combinedWallets.join('\n'));
              console.log('New wallet names saved to wallets.txt');
            }
          } else {
            // If the file does not exist, write the new wallet names to the file
            fs.writeFileSync('wallets.txt', allWallets.join('\n'));
            console.log('Wallet names saved to wallets.txt');
          }
        }

        res.send(JSON.stringify(rpcRes.result));
      } else {
        res.status(500).send("No error and no result ?");
      }
    })
    .catch(err => {
      res.status(500).send({ error: "I have an error :\n" + err });
    });
});

app.get('/api/sendtoaddress/:address/:amount', function (req, res) {
  const address = req.params.address;
  const amount = req.params.amount;
  const params = [address, amount, '', '', false, true, 6, 'economical'];

  dynamicRPCCall('testchain', 'sendtoaddress', params)
    .then(rpcRes => {
      if (typeof rpcRes.result !== 'undefined') {
        res.send(JSON.stringify(rpcRes.result));
        console.log(rpcRes.result);
        console.log('success');
      } else {
        res.status(500).send("No error and no result ?");
      }
    })
    .catch(err => {
      res.status(500).send({ error: "I have an error :\n" + err });
    });
});

app.get('/api/loadwallet/:wallet', function (req, res) {
  const wallet = req.params.wallet;
  const params = [wallet];

  const data = fs.readFileSync('wallets.txt', 'utf8');
  const allWallets = data.split('\n');

  const index = allWallets.indexOf(wallet);
  if (index !== -1) {
    allWallets.splice(index, 1);
  }

  // Unload each wallet in the remaining list
  const unloadPromises = allWallets.map(function(unloadWallet) {
    return dynamicRPCCall('testchain', 'unloadwallet', [unloadWallet])
      .then(() => {
        console.log('Unloaded wallet: ' + unloadWallet);
      })
      .catch(err => {
        console.log("Error unloading wallet: " + err);
      });
  });

  Promise.all(unloadPromises)
    .then(() => {
      // Load the new wallet
      return dynamicRPCCall('testchain', 'loadwallet', params);
    })
    .then(rpcRes => {
      if (typeof rpcRes.result !== 'undefined') {
        res.send(JSON.stringify(rpcRes.result));
        console.log(wallet + " loaded");
      } else {
        res.status(500).send("No error and no result ?");
      }
    })
    .catch(err => {
      res.status(500).send({ error: "I have an error :\n" + err });
    });
});



/*
app.get('/estimatesmartfee', function (req, res) {
 const blocks = 6;
 const params = [blocks];
 testchain_rpc.call('estimatesmartfee', params, function (err, rpcRes) {
   if (err) {
     res.status(500).send({ error: "I have an error :\n" + err });
   } else if (typeof rpcRes.result !== 'undefined') {
     res.send(JSON.stringify(rpcRes.result));
   } else {
     res.status(500).send("No error and no result ?");
   }
 });
});






app.get('/getnewaddress', function (req, res) {

testchain_rpc.call('listwallets', [], function (err, wallets) {
   if (err) {
     res.status(500).send({ error: "I have an error :\n" + err });
     return;
   }
let loadedWallet = wallets.result[0]
   const data = fs.readFileSync(`${loadedWallet}.json`, 'utf8');
   const wallet = JSON.parse(data);


 // Derive the seed from the mnemonic
 const seed = bip39.mnemonicToSeedSync(wallet.mnemonic);

 // Generate a new key pair from the seed using a different index in the derivation path
 const node = bip32.fromSeed(seed, network);

let lastUsedIndex = parseInt(wallet.index);

  // Derive the next index in the chain
let newIndex = lastUsedIndex + 1;


let path;
if (network === bitcoin.networks.bitcoin) {
 path = `m/84'/0'/0'/0/${newIndex}`;
} else if (network === bitcoin.networks.testnet) {
 path = `m/84'/1'/0'/0/${newIndex}`;
} else {
 console.error('Unknown network');
 return;
}

const keyPair = node.derivePath(path);




const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });


wallet.index = newIndex;
  fs.writeFileSync(`${loadedWallet}.json`, JSON.stringify(wallet));

res.send(JSON.stringify({address: address}));

testchain_rpc.call('importprivkey', [keyPair.toWIF(), "", false], function (err, rpcRes) {


  if (err) {
      res.status(500).send({ error: "I have an error :\n" + err });

  } else {

	console.log("Key imported successfully");
  }

});

});
});








app.get('/createwallet/:name', function (req, res) {
 const name = req.params.name;
 const params = [name];

testchain_rpc.call('createwallet', [name, false, true], function (err, rpcRes) {
  if (err) {
    res.status(500).send({ error: "I have an error :\n" + err });
  } else if (typeof rpcRes.result !== 'undefined') {


const data = fs.readFileSync('wallets.txt', 'utf8');
 const allWallets = data.split('\n');
 const index = allWallets.indexOf(name);
   if (index !== -1) {
     allWallets.splice(index, 1);
   }

const unloadPromises = allWallets.map(function(unloadWallet) {
 return new Promise((resolve, reject) => {
   testchain_rpc.call('unloadwallet', [unloadWallet], function (err, rpcRes) {
     if (err) {
       console.log("Error unloading wallet: " + err);
       reject(err);
     } else {
       console.log('Unloaded wallet: ' + unloadWallet);
       resolve();
     }
   });
 });
});


Promise.all(unloadPromises)
 .then(() => {

// Add the new wallet name to the array of all wallets
allWallets.push(name);

// Write the updated array of all wallets to the wallets.txt file
fs.writeFileSync('wallets.txt', allWallets.join('\n'));

console.log('Wallet names saved to wallets.txt');


// Generate a random mnemonic
const mnemonic = bip39.generateMnemonic();

// Convert mnemonic to a seed
const seed = bip39.mnemonicToSeedSync(mnemonic);

// Derive the master private key
const master = bip32.fromSeed(seed, network);

let path;
if (network === bitcoin.networks.bitcoin) {
 path = "m/84'/0'/0'/0/1";
} else if (network === bitcoin.networks.testnet) {
 path = "m/84'/1'/0'/0/1";
} else {
 console.error('Unknown network');
 return;
}

const account = master.derivePath(path);




// Generate a new key pair from the seed

let wif = account.toWIF();
const { address } = bitcoin.payments.p2wpkh({ pubkey: account.publicKey, network });

 // Save the mnemonic and address to a file
 fs.writeFileSync(`${name}.json`, JSON.stringify({ mnemonic, address, index: 2 }));

     res.send(JSON.stringify({ wallet: {address}, mnemonic}));
     console.log(name + " loaded ");


testchain_rpc.call('importprivkey', [wif, "", false], function (err, rpcRes) {
 if (err) {
  res.status(500).send({ error: "I have an error :\n" + err });
 } else {
console.log('key imported')
 }
});




 })

  } else {
       res.status(500).send("No error and no result ?");
  }
 });
});


*/

// Serve static files from the current directory
//app.use(express.static(__dirname));




/*
app.listen(3001, function () {
  console.log('Server listening on port 3001!');
});
*/

const sslCert = generateSelfSignedCertificate();

// Write the certificate and key to files
fs.writeFileSync('server.crt', sslCert.cert);
fs.writeFileSync('server.key', sslCert.privateKey);

const httpsOptions = {
  key: sslCert.privateKey,
  cert: sslCert.cert
};







// Serve static files from the testchain directory
//app.use('/testchain', express.static(path.join(__dirname, 'testchain')));

// Serve testchain.html
app.get('/testchain/testchain.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'testchain.html'));
});

// Your testchain-specific routes and logic here...

//module.exports = app;





/*
const customUrlParam = generateRandomNumber();

const parentDir = path.join(__dirname, '..');
fs.writeFileSync(path.join(parentDir, 'testchain_key.txt'), customUrlParam.toString());
*/

/*
app.use((req, res, next) => {
  if (req.query.key !== customUrlParam.toString()) {
    return res.status(403).send('Access Denied');
  }
  next();
});
*/




/*
app.use((req, res, next) => {
 // if (req.query.key === customUrlParam.toString()) {
    express.static(__dirname)(req, res, next);
//  } else {
//    next();
//  }
});


getPublicIP().then((ip) => {
  const port = 443; // Change this to 3001 if you don't have root privileges
  const server = https.createServer(httpsOptions, app);
  server.listen(port, () => {
    console.log(`HTTPS Server running at https://${ip}:${port}/testchain/testchain.html`);
    console.log(`Access this URL on your phone's browser`);
  });
}).catch((err) => {
  console.error('Error getting public IP:', err);
});
*/
module.exports = app;
