from flask import Flask, request, jsonify, render_template
import os
import mysql.connector
from mysql.connector import Error
import time
import re
import datetime

app = Flask(__name__)

# --- Database Connection Configuration ---
def create_db_connection():
    try:
        # Read DB password from environment when possible, fallback to previous local password
        db_password = os.environ.get('DB_PASSWORD', 'Y9mc92034')
        connection = mysql.connector.connect(
            host='localhost',
            user='root',
            password= 'Y9mc92034',
            database='pet_clinic_db'
        )
        return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

# --- HTML Page Rendering ---
@app.route('/')
def schedule_page():
    """Renders the main schedule page (index.html)."""
    return render_template('index.html')

@app.route('/owners')
def owners_page():
    """Renders the Owner & Pet management page."""
    return render_template('owners.html')

@app.route('/billing')
def billing_page():
    """Renders the billing and payments page."""
    return render_template('billing.html')

# --- API ENDPOINTS ---

# == Owner & Pet Management ==
@app.route('/api/owners', methods=['POST'])
def add_owner():
    data = request.get_json() or {}
    # validate required owner fields
    required = ['firstName', 'lastName', 'phone', 'address']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'message': f"Missing required owner fields: {', '.join(missing)}"}), 400

    # server-side format validation for phone and email
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip() if data.get('email') else ''
    
    # normalize phone (allow spaces, dashes, parens) then check digits
    cleaned_phone = re.sub(r'[\s\-\(\)\.]+', '', phone)
    if not re.fullmatch(r'\+?\d{7,15}', cleaned_phone):
        return jsonify({'message': 'Invalid phone format. Use digits, optional +, 7–15 digits.'}), 400
    
    if email:
        if not re.fullmatch(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
            return jsonify({'message': 'Invalid email format.'}), 400

    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500

    cursor = None
    try:
        cursor = connection.cursor()
        sql_owner = "INSERT INTO Owner (FirstName, LastName, Phone, Address) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql_owner, (data.get('firstName'), data.get('lastName'), phone, data.get('address')))
        owner_id = cursor.lastrowid
        # optional email
        if email:
            sql_email = "INSERT INTO Owner_Email (OwnerID, Email) VALUES (%s, %s)"
            cursor.execute(sql_email, (owner_id, email))
        connection.commit()
        return jsonify({'message': 'Owner added successfully!', 'ownerId': owner_id}), 201
    except Error as e:
        if connection:
            connection.rollback()
        return jsonify({'message': f'Failed to add owner: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

@app.route('/api/owners', methods=['GET'])
def get_owners():
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Owner ORDER BY FirstName")
    owners = cursor.fetchall()
    cursor.close()
    connection.close()
    return jsonify(owners)

@app.route('/api/pets', methods=['POST'])
def add_pet():
    data = request.get_json()
    if not all(k in data and data[k] not in [None, ''] for k in ['name', 'species', 'breed', 'dob', 'ownerId']):
        return jsonify({'message': 'Missing one or more required fields'}), 400
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    try:
        cursor = connection.cursor()
        sql = "INSERT INTO Pet (Name, Species, Breed, DoB, OwnerID) VALUES (%s, %s, %s, %s, %s)"
        cursor.execute(sql, (data['name'], data['species'], data['breed'], data['dob'], data['ownerId']))
        connection.commit()
        return jsonify({'message': 'Pet added successfully!'}), 201
    except Error as e:
        connection.rollback()
        return jsonify({'message': f'Failed to add pet: {e}'}), 500
    finally:
        try:
            if 'cursor' in locals() and cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

@app.route('/api/owners/<int:owner_id>/pets', methods=['GET'])
def get_pets_for_owner(owner_id):
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    sql = """
        SELECT PetID, Name, Species, Breed, DoB, OwnerID, TIMESTAMPDIFF(YEAR, DoB, CURDATE()) AS Age 
        FROM Pet 
        WHERE OwnerID = %s
    """
    cursor.execute(sql, (owner_id,))
    pets = cursor.fetchall()
    cursor.close()
    connection.close()
    for pet in pets:
        if pet.get('DoB'): pet['DoB'] = pet['DoB'].isoformat()
    return jsonify(pets)

# == Veterinarian Management & "Treats" Relationship ==
@app.route('/api/veterinarians', methods=['GET'])
def get_veterinarians():
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Veterinarian")
    vets = cursor.fetchall()
    cursor.close()
    connection.close()
    return jsonify(vets)

@app.route('/api/pets/<int:pet_id>/vets', methods=['GET'])
def get_vets_for_pet(pet_id):
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    sql = """
        SELECT v.VetID, v.Name, vtp.is_primary_vet 
        FROM Veterinarian v
        JOIN Vet_Treats_Pet vtp ON v.VetID = vtp.VetID
        WHERE vtp.PetID = %s
    """
    cursor.execute(sql, (pet_id,))
    vets = cursor.fetchall()
    cursor.close()
    connection.close()
    return jsonify(vets)

@app.route('/api/vet-pet-link', methods=['POST'])
def add_vet_pet_link():
    data = request.get_json() or {}
    if not all(k in data for k in ('petId', 'vetId', 'isPrimary')):
        return jsonify({'message': 'Missing petId, vetId or isPrimary'}), 400
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor()
        # If setting a vet as primary, clear previous primary flag for that pet
        if data.get('isPrimary'):
            sql_reset = "UPDATE Vet_Treats_Pet SET is_primary_vet = FALSE WHERE PetID = %s"
            cursor.execute(sql_reset, (data.get('petId'),))
        sql_insert = """
            INSERT INTO Vet_Treats_Pet (PetID, VetID, is_primary_vet)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE is_primary_vet = VALUES(is_primary_vet)
        """
        cursor.execute(sql_insert, (data.get('petId'), data.get('vetId'), bool(data.get('isPrimary'))))
        connection.commit()
        return jsonify({'message': 'Veterinarian assigned successfully!'}), 201
    except Error as e:
        if connection:
            connection.rollback()
        return jsonify({'message': f'Failed to assign veterinarian: {e}'}), 500
    finally:
        try:
            if cursor: cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected(): connection.close()
        except Exception:
            pass

# == Appointments and Billing ==
@app.route('/api/appointments', methods=['POST'])
def book_appointment():
    data = request.get_json()
    connection = create_db_connection()
    cursor = connection.cursor()
    sql = "INSERT INTO Appointment (PetID, VetID, Date, Time, Reason) VALUES (%s, %s, %s, %s, %s)"
    cursor.execute(sql, (data['petId'], data['vetId'], data['date'], data['time'], data['reason']))
    connection.commit()
    cursor.close()
    connection.close()
    return jsonify({'message': 'Appointment booked successfully!'}), 201

@app.route('/api/appointments', methods=['GET'])
def get_appointments():
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    query = """
        SELECT a.AppID, a.Date, a.Time, a.Reason, a.Status,
               p.Name as PetName, v.Name as VetName, o.FirstName, o.LastName
        FROM Appointment a
        JOIN Pet p ON a.PetID = p.PetID
        JOIN Veterinarian v ON a.VetID = v.VetID
        JOIN Owner o ON p.OwnerID = o.OwnerID
        ORDER BY a.Date DESC, a.Time
    """
    cursor.execute(query)
    appointments = cursor.fetchall()
    cursor.close()
    connection.close()
    for appt in appointments:
        if appt.get('Date'): appt['Date'] = appt['Date'].isoformat()
        if appt.get('Time'): appt['Time'] = str(appt['Time'])
    return jsonify(appointments)
    
@app.route('/api/appointments/<int:app_id>/complete', methods=['POST'])
def complete_visit(app_id):
    data = request.get_json()
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    try:
        cursor = connection.cursor()
        unique_id = int(time.time())
        sql_treatment = "INSERT INTO Treatment_Record (AppID, TreatmentID, Description, Medicine, Notes, Cost) VALUES (%s, %s, %s, %s, %s, %s)"
        treatment_values = (app_id, unique_id, data['description'], data['medicine'], data['notes'], data['cost'])
        cursor.execute(sql_treatment, treatment_values)
        sql_update_appt = "UPDATE Appointment SET Status = 'Completed' WHERE AppID = %s"
        cursor.execute(sql_update_appt, (app_id,))
        sql_billing = "INSERT INTO Billing (AppID, Amount, Date, Status) VALUES (%s, %s, CURDATE(), %s)"
        billing_values = (app_id, data['cost'], 'Unpaid')
        cursor.execute(sql_billing, billing_values)
        connection.commit()
        return jsonify({'message': 'Visit completed and bill generated successfully!'})
    except Error as e:
        connection.rollback()
        print(f"Transaction failed: {e}")
        return jsonify({'message': f'Transaction failed: {e}'}), 500
    finally:
        try:
            if 'cursor' in locals() and cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

@app.route('/api/billing', methods=['GET'])
def get_bills():
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    query = """
        SELECT b.AppID, b.BillID, b.Amount, b.Date, b.Status, b.Mode,
               o.FirstName, o.LastName, p.Name as PetName
        FROM Billing b
        JOIN Appointment a ON b.AppID = a.AppID
        JOIN Pet p ON a.PetID = p.PetID
        JOIN Owner o ON p.OwnerID = o.OwnerID
        ORDER BY b.Date DESC, b.AppID DESC
    """
    cursor.execute(query)
    bills = cursor.fetchall()
    cursor.close()
    connection.close()
    for bill in bills:
        if bill.get('Date'): bill['Date'] = bill['Date'].isoformat()
    return jsonify(bills)

@app.route('/api/billing/<int:app_id>/<int:bill_id>/pay', methods=['PUT'])
def process_payment(app_id, bill_id):
    data = request.get_json()
    connection = create_db_connection()
    cursor = connection.cursor()
    sql = "UPDATE Billing SET Status = 'Paid', Mode = %s WHERE AppID = %s AND BillID = %s"
    cursor.execute(sql, (data['mode'], app_id, bill_id))
    connection.commit()
    cursor.close()
    connection.close()
    return jsonify({'message': 'Payment processed successfully!'})

# New endpoint: pet history using stored procedure GetPetHistory
@app.route('/api/pet-history/<int:pet_id>', methods=['GET'])
def get_pet_history(pet_id):
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        # Use callproc and collect stored_results
        cursor.callproc('GetPetHistory', [pet_id])
        rows = []
        for result in cursor.stored_results():
            rows.extend(result.fetchall())
        # Normalize date fields to ISO strings where applicable
        for r in rows:
            if r.get('DoB') and isinstance(r['DoB'], (datetime.date, datetime.datetime)):
                r['DoB'] = r['DoB'].isoformat()
            if r.get('AppointmentDate') and isinstance(r['AppointmentDate'], (datetime.date, datetime.datetime)):
                r['AppointmentDate'] = r['AppointmentDate'].isoformat()
        return jsonify(rows)
    except Error as e:
        return jsonify({'message': f'Failed to retrieve pet history: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

# == UPDATE OPERATIONS ==
@app.route('/api/owners/<int:owner_id>', methods=['PUT'])
def update_owner(owner_id):
    data = request.get_json() or {}
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor()
        updates = []
        params = []
        if data.get('firstName'):
            updates.append("FirstName = %s")
            params.append(data['firstName'])
        if data.get('lastName'):
            updates.append("LastName = %s")
            params.append(data['lastName'])
        if data.get('phone'):
            phone = data['phone'].strip()
            cleaned_phone = re.sub(r'[\s\-\(\)\.]+', '', phone)
            if not re.fullmatch(r'\+?\d{7,15}', cleaned_phone):
                return jsonify({'message': 'Invalid phone format'}), 400
            updates.append("Phone = %s")
            params.append(phone)
        if data.get('address'):
            updates.append("Address = %s")
            params.append(data['address'])
        if not updates:
            return jsonify({'message': 'No fields to update'}), 400
        params.append(owner_id)
        sql = f"UPDATE Owner SET {', '.join(updates)} WHERE OwnerID = %s"
        cursor.execute(sql, params)
        connection.commit()
        return jsonify({'message': 'Owner updated successfully!'}), 200
    except Error as e:
        if connection:
            connection.rollback()
        return jsonify({'message': f'Failed to update owner: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

@app.route('/api/pets/<int:pet_id>', methods=['PUT'])
def update_pet(pet_id):
    data = request.get_json() or {}
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor()
        updates = []
        params = []
        if data.get('name'):
            updates.append("Name = %s")
            params.append(data['name'])
        if data.get('species'):
            updates.append("Species = %s")
            params.append(data['species'])
        if data.get('breed'):
            updates.append("Breed = %s")
            params.append(data['breed'])
        if data.get('dob'):
            updates.append("DoB = %s")
            params.append(data['dob'])
        if not updates:
            return jsonify({'message': 'No fields to update'}), 400
        params.append(pet_id)
        sql = f"UPDATE Pet SET {', '.join(updates)} WHERE PetID = %s"
        cursor.execute(sql, params)
        connection.commit()
        return jsonify({'message': 'Pet updated successfully!'}), 200
    except Error as e:
        if connection:
            connection.rollback()
        return jsonify({'message': f'Failed to update pet: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

# == DELETE OPERATIONS ==
@app.route('/api/owners/<int:owner_id>', methods=['DELETE'])
@app.route('/api/owners/<int:owner_id>', methods=['DELETE'])
def delete_owner(owner_id):
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor()
        
        # Delete owner emails first
        sql_emails = "DELETE FROM Owner_Email WHERE OwnerID = %s"
        cursor.execute(sql_emails, (owner_id,))
        
        # Get all pets for this owner to delete related appointment data
        sql_get_pets = "SELECT PetID FROM Pet WHERE OwnerID = %s"
        cursor.execute(sql_get_pets, (owner_id,))
        pet_rows = cursor.fetchall()
        
        for pet_row in pet_rows:
            pet_id = pet_row[0]
            # Delete billing records
            sql_billing = "DELETE FROM Billing WHERE AppID IN (SELECT AppID FROM Appointment WHERE PetID = %s)"
            cursor.execute(sql_billing, (pet_id,))
            
            # Delete treatment records
            sql_treatment = "DELETE FROM Treatment_Record WHERE AppID IN (SELECT AppID FROM Appointment WHERE PetID = %s)"
            cursor.execute(sql_treatment, (pet_id,))
            
            # Delete vet-pet links
            sql_vet_pet = "DELETE FROM Vet_Treats_Pet WHERE PetID = %s"
            cursor.execute(sql_vet_pet, (pet_id,))
            
            # Delete appointments
            sql_appt = "DELETE FROM Appointment WHERE PetID = %s"
            cursor.execute(sql_appt, (pet_id,))
        
        # Delete all pets for this owner
        sql_pets = "DELETE FROM Pet WHERE OwnerID = %s"
        cursor.execute(sql_pets, (owner_id,))
        
        # Finally delete the owner
        sql_owner = "DELETE FROM Owner WHERE OwnerID = %s"
        cursor.execute(sql_owner, (owner_id,))
        
        if cursor.rowcount == 0:
            return jsonify({'message': 'Owner not found'}), 404
        
        connection.commit()
        return jsonify({'message': 'Owner and all associated records deleted successfully!'}), 200
    except Error as e:
        if connection:
            connection.rollback()
        return jsonify({'message': f'Failed to delete owner: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

@app.route('/api/pets/<int:pet_id>', methods=['DELETE'])
def delete_pet(pet_id):
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor()
        
        # First, delete billing records for appointments linked to this pet
        sql_billing = """DELETE FROM Billing WHERE AppID IN (
                            SELECT AppID FROM Appointment WHERE PetID = %s
                        )"""
        cursor.execute(sql_billing, (pet_id,))
        
        # Then delete treatment records for appointments linked to this pet
        sql_treatment = """DELETE FROM Treatment_Record WHERE AppID IN (
                              SELECT AppID FROM Appointment WHERE PetID = %s
                          )"""
        cursor.execute(sql_treatment, (pet_id,))
        
        # Delete vet-pet links
        sql_vet_pet = "DELETE FROM Vet_Treats_Pet WHERE PetID = %s"
        cursor.execute(sql_vet_pet, (pet_id,))
        
        # Delete appointments for this pet
        sql_appointments = "DELETE FROM Appointment WHERE PetID = %s"
        cursor.execute(sql_appointments, (pet_id,))
        
        # Finally delete the pet
        sql_pet = "DELETE FROM Pet WHERE PetID = %s"
        cursor.execute(sql_pet, (pet_id,))
        
        if cursor.rowcount == 0:
            return jsonify({'message': 'Pet not found'}), 404
        
        connection.commit()
        return jsonify({'message': 'Pet and all associated records deleted successfully!'}), 200
    except Error as e:
        if connection:
            connection.rollback()
        return jsonify({'message': f'Failed to delete pet: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

# == AGGREGATE QUERIES ==
@app.route('/api/analytics/bills-summary', methods=['GET'])
def get_bills_summary():
    """Aggregate: Total bills per owner with count and sum"""
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        sql = """
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
            ORDER BY TotalAmount DESC
        """
        cursor.execute(sql)
        results = cursor.fetchall()
        return jsonify(results)
    except Error as e:
        return jsonify({'message': f'Failed to retrieve bills summary: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

@app.route('/api/analytics/species-count', methods=['GET'])
def get_species_count():
    """Aggregate: Pet count by species"""
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        sql = """
            SELECT 
                Species,
                COUNT(*) as PetCount,
                AVG(YEAR(CURDATE()) - YEAR(DoB)) as AvgAge
            FROM Pet
            GROUP BY Species
            ORDER BY PetCount DESC
        """
        cursor.execute(sql)
        results = cursor.fetchall()
        return jsonify(results)
    except Error as e:
        return jsonify({'message': f'Failed to retrieve species count: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

@app.route('/api/analytics/vet-workload', methods=['GET'])
def get_vet_workload():
    """Aggregate: Appointments and revenue per veterinarian"""
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        sql = """
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
            ORDER BY TotalAppointments DESC
        """
        cursor.execute(sql)
        results = cursor.fetchall()
        return jsonify(results)
    except Error as e:
        return jsonify({'message': f'Failed to retrieve vet workload: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

# == NESTED QUERIES ==
@app.route('/api/nested/owners-with-unpaid-bills', methods=['GET'])
def get_owners_with_unpaid_bills():
    """Nested Query: Owners with unpaid bills"""
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        sql = """
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
            ORDER BY o.FirstName
        """
        cursor.execute(sql)
        results = cursor.fetchall()
        return jsonify(results)
    except Error as e:
        return jsonify({'message': f'Failed to retrieve owners with unpaid bills: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

@app.route('/api/nested/pets-by-vet/<int:vet_id>', methods=['GET'])
def get_pets_by_vet(vet_id):
    """Nested Query: All pets treated by a specific vet"""
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        sql = """
            SELECT DISTINCT p.PetID, p.Name, p.Species, p.Breed, o.FirstName, o.LastName
            FROM Pet p
            JOIN Owner o ON p.OwnerID = o.OwnerID
            WHERE p.PetID IN (
                SELECT DISTINCT a.PetID
                FROM Appointment a
                WHERE a.VetID = %s
            )
            ORDER BY p.Name
        """
        cursor.execute(sql, (vet_id,))
        results = cursor.fetchall()
        return jsonify(results)
    except Error as e:
        return jsonify({'message': f'Failed to retrieve pets for vet: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

# == ADVANCED JOIN QUERIES ==
@app.route('/api/queries/pet-treatment-details', methods=['GET'])
def get_pet_treatment_details():
    """Join Query: Detailed treatment information for all pets"""
    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        sql = """
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
            ORDER BY p.PetID, a.Date DESC
        """
        cursor.execute(sql)
        results = cursor.fetchall()
        for r in results:
            if r.get('AppointmentDate') and isinstance(r['AppointmentDate'], datetime.date):
                r['AppointmentDate'] = r['AppointmentDate'].isoformat()
        return jsonify(results)
    except Error as e:
        return jsonify({'message': f'Failed to retrieve treatment details: {e}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if connection and connection.is_connected():
                connection.close()
        except Exception:
            pass

if __name__ == '__main__':
    app.run(debug=True, port=5001)