@echo off
echo [UPDATE] Starting update process...

cd C:\EnergyMeasuring

echo [UPDATE] Pulling latest changes...
git pull origin main

echo [UPDATE] Installing dependencies - EnergyDashboard...
cd C:\EnergyMeasuring\EnergyDashboard
npm install

echo [UPDATE] Installing dependencies - energyComsamption...
cd C:\EnergyMeasuring\energyComsamption
npm install

echo [UPDATE] Building React app...
cd C:\EnergyMeasuring\abb-energy-vite
npm install
npm run build

echo [UPDATE] Copying build to public...
xcopy /E /I /Y C:\EnergyMeasuring\abb-energy-vite\dist C:\EnergyMeasuring\EnergyDashboard\public

echo [UPDATE] Restarting services...
nssm restart EnergyDataV2
nssm restart EnergyDataDashboardV2

echo [UPDATE] Done!