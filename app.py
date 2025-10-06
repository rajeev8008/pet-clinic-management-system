from flask import Flask, request, jsonify, render_template
import os
import mysql.connector
from mysql.connector import Error
import time

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

    connection = create_db_connection()
    if not connection:
        return jsonify({'message': 'Database connection failed'}), 500

    cursor = None
    try:
        cursor = connection.cursor()
        sql_owner = "INSERT INTO Owner (FirstName, LastName, Phone, Address) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql_owner, (data.get('firstName'), data.get('lastName'), data.get('phone'), data.get('address')))
        owner_id = cursor.lastrowid
        # optional email
        email = data.get('email')
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
        sql_billing = "INSERT INTO Billing (AppID, BillID, Amount, Date, Status) VALUES (%s, %s, %s, CURDATE(), %s)"
        billing_values = (app_id, unique_id, data['cost'], 'Unpaid')
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

if __name__ == '__main__':
    app.run(debug=True, port=5001)