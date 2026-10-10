Write-Host "🔧 Cleaning your Node project... hold on."

# Kill any stuck Node/TS processes
taskkill /F /IM node.exe 2>$null
taskkill /F /IM Code.exe 2>$null
taskkill /F /IM WebStorm.exe 2>$null

# Remove node_modules and package-lock safely
Write-Host "🚮 Removing node_modules and package-lock.json..."
npx rimraf node_modules
if (Test-Path "package-lock.json") { Remove-Item "package-lock.json" -Force }

# Clean npm cache (deep clean)
Write-Host "🧹 Cleaning npm cache..."
npm cache clean --force | Out-Null
npm cache verify | Out-Null

# Reinstall dependencies
Write-Host "📦 Reinstalling packages..."
npm install

Write-Host "✨ Done! Your Node environment is fresh again."
