-- stored_procedures.sql
-- Stored procedures for the Energy Measuring System

/* =========================================================
   AddUser
   Adds a new user to dbo.Users
   ========================================================= */
IF OBJECT_ID('dbo.AddUser', 'P') IS NOT NULL
    DROP PROCEDURE dbo.AddUser;
GO

CREATE PROCEDURE dbo.AddUser
    @username NVARCHAR(50),
    @password_hash NVARCHAR(255),
    @role NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Users (username, password_hash, role)
    VALUES (@username, @password_hash, @role);

    SELECT 
        id,
        username,
        role,
        created_at
    FROM dbo.Users
    WHERE id = SCOPE_IDENTITY();
END;


/* =========================================================
   GetUserByUsername
   Returns a single user by username
   ========================================================= */
IF OBJECT_ID('dbo.GetUserByUsername', 'P') IS NOT NULL
    DROP PROCEDURE dbo.GetUserByUsername;
GO


CREATE PROCEDURE dbo.GetUserByUsername
    @username NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        username,
        password_hash,
        role
    FROM dbo.Users
    WHERE username = @username;
END;
GO


/* =========================================================
   GetUserByEmail
   Returns a single user by email
   ========================================================= */
CREATE PROCEDURE GetUserByEmail
    @email NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT id,
           username,
           email,
           password_hash,
           role,
           created_at
    FROM Users
    WHERE email = @email;
END


/* =========================================================
   GetBreakersFormatted
    Returns all breaker rows
    ========================================================= */
CREATE OR ALTER PROCEDURE dbo.GetBreakersFormatted
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        id,
        name,
        CONCAT(id, ' - ', name) AS displayName
    FROM dbo.Breakers
    ORDER BY id;
END;
GO


/* =========================================================
   GetTariffs
   Returns all tariff rows
   ========================================================= */
IF OBJECT_ID('dbo.GetTariffs', 'P') IS NOT NULL
    DROP PROCEDURE dbo.GetTariffs;
GO

CREATE or alter PROCEDURE dbo.GetTariffs
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        id, 
        season,
        off_rate,
        peak_rate
    FROM dbo.Tariffs
    ORDER BY id;
END;
GO


/* =========================================================
   GetConsumption
   Returns EnergyData rows for a breaker within date range
   ========================================================= */
IF OBJECT_ID('dbo.GetConsumption', 'P') IS NOT NULL
    DROP PROCEDURE dbo.GetConsumption;
GO

CREATE OR ALTER PROCEDURE dbo.GetConsumption
    @BreakerId INT,
    @FromDate DATETIME2,
    @ToDate DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH PrevRow AS (
        SELECT TOP (1)
            BreakerId,
            ActiveEnergy,
            [timestamp]
        FROM dbo.EnergyData
        WHERE BreakerId = @BreakerId
          AND [timestamp] < @FromDate
        ORDER BY [timestamp] DESC
    ),
    InRangeRows AS (
        SELECT
            BreakerId,
            ActiveEnergy,
            [timestamp]
        FROM dbo.EnergyData
        WHERE BreakerId = @BreakerId
          AND [timestamp] >= @FromDate
          AND [timestamp] < DATEADD(DAY, 1, @ToDate)
    )
    SELECT
        BreakerId AS breakerId,
        ActiveEnergy AS activeEnergy,
        [timestamp] AS [timestamp]
    FROM PrevRow

    UNION ALL

    SELECT
        BreakerId AS breakerId,
        ActiveEnergy AS activeEnergy,
        [timestamp] AS [timestamp]
    FROM InRangeRows

    ORDER BY [timestamp] ASC;
END;
GO


-- Update Tariff
CREATE OR ALTER PROCEDURE dbo.UpdateAllTariffs
    @WinterOffRate DECIMAL(10,4),
    @WinterPeakRate DECIMAL(10,4),
    @ShoulderOffRate DECIMAL(10,4),
    @ShoulderPeakRate DECIMAL(10,4),
    @SummerOffRate DECIMAL(10,4),
    @SummerPeakRate DECIMAL(10,4)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Tariffs
    SET
        off_rate = CASE season
            WHEN 'winter' THEN @WinterOffRate
            WHEN 'shoulder' THEN @ShoulderOffRate
            WHEN 'summer' THEN @SummerOffRate
        END,
        peak_rate = CASE season
            WHEN 'winter' THEN @WinterPeakRate
            WHEN 'shoulder' THEN @ShoulderPeakRate
            WHEN 'summer' THEN @SummerPeakRate
        END
    WHERE season IN ('winter', 'shoulder', 'summer');

    SELECT
        id,
        season,
        off_rate,
        peak_rate
    FROM dbo.Tariffs
    ORDER BY id;
END;
GO