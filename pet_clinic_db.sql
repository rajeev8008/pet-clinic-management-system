-- Pet Clinic Database - Complete SQL File
-- Contains: DDL, DML, Functions, Procedures, Triggers, Queries

-- ==================== DDL: CREATE TABLES ====================

CREATE DATABASE IF NOT EXISTS pet_clinic_db;
USE pet_clinic_db;

-- Owner Table
CREATE TABLE IF NOT EXISTS Owner (
    OwnerID INT PRIMARY KEY AUTO_INCREMENT,
    FirstName VARCHAR(50) NOT NULL,
    LastName VARCHAR(50) NOT NULL,
    Phone VARCHAR(15) UNIQUE,
    Address VARCHAR(255)
);

-- Owner Email (One-to-Many)
CREATE TABLE IF NOT EXISTS Owner_Email (
    OwnerID INT NOT NULL,
    Email VARCHAR(100) NOT NULL,
    PRIMARY KEY (OwnerID, Email),
    FOREIGN KEY (OwnerID) REFERENCES Owner(OwnerID) ON DELETE CASCADE
);

-- Veterinarian Table
CREATE TABLE IF NOT EXISTS Veterinarian (
    VetID INT PRIMARY KEY AUTO_INCREMENT,
    Name VARCHAR(100) NOT NULL,
    Specialization VARCHAR(100),
    Phone VARCHAR(15),
    Experience INT COMMENT 'Experience in years'
);

-- Pet Table
CREATE TABLE IF NOT EXISTS Pet (
    PetID INT PRIMARY KEY AUTO_INCREMENT,
    Name VARCHAR(50),
    Species VARCHAR(50),
    Breed VARCHAR(50),
    OwnerID INT,
    DoB DATE,
    FOREIGN KEY (OwnerID) REFERENCES Owner(OwnerID) ON DELETE CASCADE
);

-- Appointment Table
CREATE TABLE IF NOT EXISTS Appointment (
    AppID INT PRIMARY KEY AUTO_INCREMENT,
    PetID INT,
    VetID INT,
    Date DATE,
    Time TIME,
    Reason VARCHAR(255),
    Status ENUM('Scheduled', 'Completed', 'Canceled') DEFAULT 'Scheduled',
    FOREIGN KEY (PetID) REFERENCES Pet(PetID),
    FOREIGN KEY (VetID) REFERENCES Veterinarian(VetID)
);

-- Treatment Record Table
CREATE TABLE IF NOT EXISTS Treatment_Record (
    AppID INT NOT NULL,
    TreatmentID INT NOT NULL,
    Description TEXT,
    Medicine TEXT,
    Notes TEXT,
    Cost DECIMAL(10, 2),
    PRIMARY KEY (AppID, TreatmentID),
    FOREIGN KEY (AppID) REFERENCES Appointment(AppID) ON DELETE CASCADE
);

-- Billing Table
CREATE TABLE IF NOT EXISTS Billing (
    BillID INT PRIMARY KEY AUTO_INCREMENT,
    AppID INT UNIQUE,
    Amount DECIMAL(10, 2),
    Date DATE,
    Mode VARCHAR(20),
    Status ENUM('Unpaid', 'Paid') DEFAULT 'Unpaid',
    FOREIGN KEY (AppID) REFERENCES Appointment(AppID) ON DELETE CASCADE
);

-- Vet Treats Pet (Many-to-Many with attribute)
CREATE TABLE IF NOT EXISTS Vet_Treats_Pet (
    VetID INT NOT NULL,
    PetID INT NOT NULL,
    is_primary_vet BOOLEAN DEFAULT 0,
    PRIMARY KEY (VetID, PetID),
    FOREIGN KEY (VetID) REFERENCES Veterinarian(VetID) ON DELETE CASCADE,
    FOREIGN KEY (PetID) REFERENCES Pet(PetID) ON DELETE CASCADE
);

-- ==================== TRIGGERS ====================

DELIMITER ;;

-- Trigger: Prevent past appointment booking
CREATE TRIGGER before_appointment_insert
BEFORE INSERT ON Appointment
FOR EACH ROW
BEGIN
    IF NEW.Date < CURDATE() THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Error: Cannot book an appointment in the past.';
    END IF;
END ;;

DELIMITER ;

-- ==================== FUNCTIONS ====================

DELIMITER ;;

-- Function: Calculate pet age from DoB
CREATE FUNCTION CalculateAge(p_DoB DATE) RETURNS INT
DETERMINISTIC
BEGIN
    RETURN TIMESTAMPDIFF(YEAR, p_DoB, CURDATE());
END ;;

DELIMITER ;

-- ==================== STORED PROCEDURES ====================

DELIMITER ;;

-- Procedure: Get complete pet history (joins, left joins)
CREATE PROCEDURE GetPetHistory(IN p_PetID INT)
BEGIN
    SELECT 
        p.Name AS PetName,
        p.Species,
        p.Breed,
        p.DoB,
        o.FirstName,
        o.LastName,
        o.Phone AS OwnerPhone,
        a.AppID,
        a.Date AS AppointmentDate,
        a.Reason,
        v.Name AS VetName
    FROM Pet p
    JOIN Owner o ON p.OwnerID = o.OwnerID
    LEFT JOIN Appointment a ON p.PetID = a.PetID
    LEFT JOIN Veterinarian v ON a.VetID = v.VetID
    WHERE p.PetID = p_PetID
    ORDER BY a.Date DESC;
END ;;

DELIMITER ;

-- ==================== DML: INSERT SAMPLE DATA ====================

-- Insert Owners
INSERT INTO Owner (FirstName, LastName, Phone, Address) VALUES
('Anjali', 'Patel', '9876543210', 'Koramangala, Bengaluru'),
('Vikram', 'Singh', '9876543211', 'Indiranagar, Bengaluru'),
('Priya', 'Rao', '9876543212', 'Jayanagar, Bengaluru'),
('Amit', 'Sharma', '9876543213', 'Whitefield, Bengaluru'),
('Sunita', 'Gupta', '9876543214', 'HSR Layout, Bengaluru');

-- Insert Veterinarians
INSERT INTO Veterinarian (Name, Specialization, Phone, Experience) VALUES
('Dr. Mehra', 'Surgery', '8123456780', 10),
('Dr. Verma', 'General Practice', '8123456781', 5),
('Dr. Chen', 'Dermatology', '8123456782', 7),
('Dr. Jones', 'Cardiology', '8123456783', 12),
('Dr. Khan', 'General Practice', '8123456784', 3);

-- Insert Pets
INSERT INTO Pet (Name, Species, Breed, OwnerID, DoB) VALUES
('Buddy', 'Dog', 'Golden Retriever', 1, '2021-05-10'),
('Lucy', 'Cat', 'Siamese', 2, '2022-01-15'),
('Max', 'Dog', 'German Shepherd', 3, '2020-11-20'),
('Misty', 'Cat', 'Persian', 4, '2023-02-01'),
('Rocky', 'Dog', 'Beagle', 5, '2022-08-30');

-- ==================== AGGREGATE QUERIES ====================

-- Query 1: Total bills per owner with payment status
SELECT 
    o.OwnerID,
    o.FirstName,
    o.LastName,
    COUNT(b.BillID) as TotalBills,
    SUM(b.Amount) as TotalAmount,
    SUM(CASE WHEN b.Status = 'Paid' THEN b.Amount ELSE 0 END) as PaidAmount,
    SUM(CASE WHEN b.Status = 'Unpaid' THEN b.Amount ELSE 0 END) as UnpaidAmount
FROM Owner o
LEFT JOIN Pet p ON o.OwnerID = p.OwnerID
LEFT JOIN Appointment a ON p.PetID = a.PetID
LEFT JOIN Billing b ON a.AppID = b.AppID
GROUP BY o.OwnerID, o.FirstName, o.LastName
ORDER BY TotalAmount DESC;

-- Query 2: Pet count by species with average age
SELECT 
    Species,
    COUNT(*) as PetCount,
    AVG(TIMESTAMPDIFF(YEAR, DoB, CURDATE())) as AvgAge
FROM Pet
GROUP BY Species
ORDER BY PetCount DESC;

-- Query 3: Veterinarian workload (appointments and revenue)
SELECT 
    v.VetID,
    v.Name,
    v.Specialization,
    COUNT(a.AppID) as TotalAppointments,
    SUM(b.Amount) as TotalRevenue,
    AVG(b.Amount) as AvgBillAmount
FROM Veterinarian v
LEFT JOIN Appointment a ON v.VetID = a.VetID
LEFT JOIN Billing b ON a.AppID = b.AppID
GROUP BY v.VetID, v.Name, v.Specialization
ORDER BY TotalAppointments DESC;

-- ==================== NESTED QUERIES ====================

-- Query 4: Owners with unpaid bills (nested subquery)
SELECT DISTINCT o.OwnerID, o.FirstName, o.LastName, o.Phone
FROM Owner o
WHERE o.OwnerID IN (
    SELECT DISTINCT p.OwnerID
    FROM Pet p
    WHERE p.PetID IN (
        SELECT a.PetID
        FROM Appointment a
        WHERE a.AppID IN (
            SELECT b.AppID
            FROM Billing b
            WHERE b.Status = 'Unpaid'
        )
    )
)
ORDER BY o.FirstName;

-- Query 5: Pets treated by a specific vet (nested)
SELECT DISTINCT p.PetID, p.Name, p.Species, p.Breed, o.FirstName, o.LastName
FROM Pet p
JOIN Owner o ON p.OwnerID = o.OwnerID
WHERE p.PetID IN (
    SELECT DISTINCT a.PetID
    FROM Appointment a
    WHERE a.VetID = 1
)
ORDER BY p.Name;

-- ==================== JOIN QUERIES ====================

-- Query 6: Pet treatment details (multiple joins)
SELECT 
    p.PetID,
    p.Name as PetName,
    p.Species,
    p.Breed,
    o.FirstName as OwnerName,
    v.Name as VetName,
    a.Date as AppointmentDate,
    a.Reason,
    a.Status,
    t.Description,
    t.Medicine,
    t.Cost,
    b.Amount,
    b.Status as PaymentStatus
FROM Pet p
JOIN Owner o ON p.OwnerID = o.OwnerID
LEFT JOIN Appointment a ON p.PetID = a.PetID
LEFT JOIN Veterinarian v ON a.VetID = v.VetID
LEFT JOIN Treatment_Record t ON a.AppID = t.AppID
LEFT JOIN Billing b ON a.AppID = b.AppID
ORDER BY p.PetID, a.Date DESC;

-- Query 7: Pets and their primary veterinarian
SELECT 
    p.PetID,
    p.Name,
    p.Species,
    o.FirstName as OwnerName,
    v.Name as PrimaryVet,
    v.Specialization
FROM Pet p
JOIN Owner o ON p.OwnerID = o.OwnerID
JOIN Vet_Treats_Pet vtp ON p.PetID = vtp.PetID AND vtp.is_primary_vet = 1
JOIN Veterinarian v ON vtp.VetID = v.VetID
ORDER BY o.FirstName, p.Name;

-- ==================== CREATE OPERATIONS ====================

-- Example: Create (Insert) new owner
INSERT INTO Owner (FirstName, LastName, Phone, Address) 
VALUES ('John', 'Doe', '9999999999', '123 Main St, Bengaluru');

-- Example: Create new appointment
INSERT INTO Appointment (PetID, VetID, Date, Time, Reason, Status)
VALUES (1, 2, '2025-12-15', '14:30:00', 'Regular checkup', 'Scheduled');

-- ==================== READ OPERATIONS ====================

-- Example: Read all owners with their contact details
SELECT o.OwnerID, o.FirstName, o.LastName, o.Phone, oe.Email
FROM Owner o
LEFT JOIN Owner_Email oe ON o.OwnerID = oe.OwnerID
ORDER BY o.FirstName;

-- Example: Read all appointments with pet and vet details
SELECT a.AppID, p.Name as PetName, v.Name as VetName, a.Date, a.Time, a.Reason, a.Status
FROM Appointment a
JOIN Pet p ON a.PetID = p.PetID
JOIN Veterinarian v ON a.VetID = v.VetID
ORDER BY a.Date DESC;

-- ==================== UPDATE OPERATIONS ====================

-- Example: Update owner contact
UPDATE Owner SET Phone = '9876543215' WHERE OwnerID = 1;

-- Example: Update appointment status
UPDATE Appointment SET Status = 'Completed' WHERE AppID = 1;

-- Example: Update billing payment status
UPDATE Billing SET Status = 'Paid', Mode = 'Card' WHERE BillID = 101;

-- ==================== DELETE OPERATIONS ====================

-- Example: Delete a pet (cascades to appointments, treatments, billing)
-- DELETE FROM Pet WHERE PetID = 5;

-- Example: Delete an owner (cascades to pets, appointments, billing, emails)
-- DELETE FROM Owner WHERE OwnerID = 5;

-- Example: Delete an appointment (cascades to treatments, billing)
-- DELETE FROM Appointment WHERE AppID = 7;

-- ==================== FUNCTION USAGE ====================

-- Calculate age of all pets
SELECT Name, DoB, CalculateAge(DoB) AS CurrentAge 
FROM Pet
ORDER BY CurrentAge DESC;

-- ==================== PROCEDURE USAGE ====================

-- Get complete history for a specific pet
CALL GetPetHistory(1);

-- ==================== END OF FILE ====================
