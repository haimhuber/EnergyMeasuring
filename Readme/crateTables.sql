-- create_tables.sql
-- Database initialization script for the Energy Measuring System

-- Create Tariffs table
IF OBJECT_ID('dbo.Tariffs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Tariffs (
        id INT PRIMARY KEY,
        season NVARCHAR(20) NOT NULL,
        off_rate DECIMAL(10,4) NOT NULL,
        peak_rate DECIMAL(10,4) NOT NULL,
        vat_rate DECIMAL(5,2) NOT NULL
    );
END;
GO

-- Seed Tariffs table
IF NOT EXISTS (SELECT 1 FROM dbo.Tariffs)
BEGIN
    INSERT INTO dbo.Tariffs (id, season, off_rate, peak_rate, vat_rate)
    VALUES
        (1, 'winter',   0.4022, 0.9774, 0.18),
        (2, 'shoulder', 0.3945, 0.4293, 0.18),
        (3, 'summer',   0.4358, 1.4597, 0.18);
END;
GO

-- Create Breakers table
IF OBJECT_ID('dbo.Breakers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Breakers (
        id INT PRIMARY KEY,
        name NVARCHAR(100) NOT NULL
    );
END;
GO

-- Seed Breakers table
IF NOT EXISTS (SELECT 1 FROM dbo.Breakers)
BEGIN
    INSERT INTO dbo.Breakers (id, name)
    VALUES
        (1, 'Q0 · Roof Main Breaker'),
        (2, 'Carrier'),
        (3, 'AEMAC'),
        (4, 'Q0 · B0 Main Breaker Building'),
        (5, 'Q4 · B0 Neu Reality'),
        (6, 'Q0 · PB Main Parking'),
        (7, 'Q0 · PB1 AC Charges');
END;
GO

-- Create Users table
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(50) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        role NVARCHAR(20) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END;
GO

-- Create EnergyData table
IF OBJECT_ID('dbo.EnergyData', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EnergyData (
        id INT IDENTITY(1,1) PRIMARY KEY,
        BreakerId INT NOT NULL,
        ActiveEnergy FLOAT NOT NULL,
        [timestamp] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END;
GO

-- Recommended index for time-based queries
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_EnergyData_BreakerId_Timestamp'
      AND object_id = OBJECT_ID('dbo.EnergyData')
)
BEGIN
    CREATE INDEX IX_EnergyData_BreakerId_Timestamp
    ON dbo.EnergyData (BreakerId, [timestamp]);
END;
GO

-- Bulk insert example for EnergyData from CSV
-- Expected CSV format:
-- BreakerId,ActiveEnergy,timestamp
-- 1,991508,2026-02-25T12:53:12.884Z
-- 2,17481,2026-02-25T12:53:12.890Z
-- Notes:
-- 1. The SQL Server service account must have access to the file path.
-- 2. Update the file path before running.
-- 3. If your CSV contains UTC timestamps with Z suffix, import first into a staging table,
--    then convert into DATETIME2 in the final table.

IF OBJECT_ID('dbo.EnergyData_Staging', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EnergyData_Staging (
        BreakerId NVARCHAR(50) NULL,
        ActiveEnergy NVARCHAR(50) NULL,
        [timestamp] NVARCHAR(100) NULL
    );
END;
GO

-- Optional cleanup before a fresh import
-- TRUNCATE TABLE dbo.EnergyData_Staging;
-- TRUNCATE TABLE dbo.EnergyData;

-- BULK load raw CSV into staging table
-- Replace the path with the real file location on the SQL Server machine
BULK INSERT dbo.EnergyData_Staging
FROM 'C:\Energy\energyData.csv'
WITH (
    FIRSTROW = 2,
    FIELDTERMINATOR = ',',
    ROWTERMINATOR = '0x0a',
    TABLOCK,
    CODEPAGE = '65001'
);
GO

-- Move validated data from staging into final table
INSERT INTO dbo.EnergyData (BreakerId, ActiveEnergy, [timestamp])
SELECT
    TRY_CAST(BreakerId AS INT),
    TRY_CAST(ActiveEnergy AS FLOAT),
    TRY_CAST(REPLACE(REPLACE([timestamp], 'T', ' '), 'Z', '') AS DATETIME2)
FROM dbo.EnergyData_Staging
WHERE TRY_CAST(BreakerId AS INT) IS NOT NULL
  AND TRY_CAST(ActiveEnergy AS FLOAT) IS NOT NULL
  AND TRY_CAST(REPLACE(REPLACE([timestamp], 'T', ' '), 'Z', '') AS DATETIME2) IS NOT NULL;
GO
