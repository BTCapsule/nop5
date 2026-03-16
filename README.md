# Setup

## 1. Install Node.js (via NVM)

### macOS / Linux

Install **nvm**:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

Restart your terminal, then install Node.js:

```bash
nvm install node
```

Verify installation:

```bash
node -v
npm -v
```

---

### Windows

Install **nvm-windows**:

https://github.com/coreybutler/nvm-windows/releases

Then run:

```bash
nvm install latest
nvm use latest
```

Verify installation:

```bash
node -v
npm -v
```

---

## 2. Enter the Project Folder

```bash
cd nop5
```

---

## 3. Install Dependencies

```bash
npm install
```

---

## 4. Start the Server

```bash
npm start
```

The server will run at:

```
http://127.0.0.1:3000
```
