@echo off
echo [UPDATE] Starting update process...

cd C:\EnergyMeasuring
echo [UPDATE] Pulling latest changes...
git pull origin main

echo [UPDATE] Installing dependencies - EnergyDashboard...
cd C:\EnergyMeasuring\EnergyDashboard
call npm install

echo [UPDATE] Installing dependencies - energyComsamption...
cd C:\EnergyMeasuring\energyComsamption
call npm install

echo [UPDATE] Building React app...
cd C:\EnergyMeasuring\abb-energy-vite
call npm install
call npm run build

echo [UPDATE] Copying build to public...
xcopy /E /I /Y C:\EnergyMeasuring\abb-energy-vite\dist C:\EnergyMeasuring\EnergyDashboard\public

echo [UPDATE] Restarting EnergyDataV2...
nssm restart EnergyDataV2

echo [UPDATE] Waiting 5 seconds...
timeout /t 5 /nobreak

echo [UPDATE] Restarting Dashboard (this process will end)...
start /b cmd /c "timeout /t 3 /nobreak && nssm restart EnergyDataDashboardV2"

echo [UPDATE] Done!