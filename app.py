from flask import Flask, request, jsonify, render_template
import mysql.connector
from mysql.connector import Error

app = Flask(__name__)

# --- Database Connection (same as before) ---
def create_db_connection():
    try:
        connection = mysql.connector.connect(
            host='localhost',
            user='root',
            password='Y9mc92034', # IMPORTANT: Change to your MySQL password
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

# --- API ENDPOINTS (with new billing routes) ---

# == Owner & Pet Management (no changes here) ==
@app.route('/api/owners', methods=['POST'])
def add_owner():
    data = request.get_json()
    connection = create_db_connection()
    cursor = connection.cursor()
    sql = "INSERT INTO Owner (FirstName, LastName, Phone, Address) VALUES (%s, %s, %s, %s)"
    cursor.execute(sql, (data['firstName'], data['lastName'], data['phone'], data['address']))
    connection.commit()
    owner_id = cursor.lastrowid
    cursor.close()
    connection.close()
    return jsonify({'message': 'Owner added successfully!', 'ownerId': owner_id}), 201

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
    connection = create_db_connection()
    cursor = connection.cursor()
    sql = "INSERT INTO Pet (Name, Species, Breed, Age, OwnerID) VALUES (%s, %s, %s, %s, %s)"
    cursor.execute(sql, (data['name'], data['species'], data['breed'], data['age'], data['ownerId']))
    connection.commit()
    cursor.close()
    connection.close()
    return jsonify({'message': 'Pet added successfully!'}), 201

@app.route('/api/owners/<int:owner_id>/pets', methods=['GET'])
def get_pets_for_owner(owner_id):
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Pet WHERE OwnerID = %s", (owner_id,))
    pets = cursor.fetchall()
    cursor.close()
    connection.close()
    return jsonify(pets)

# == Veterinarian & Appointment (no changes here) ==
@app.route('/api/veterinarians', methods=['GET'])
def get_veterinarians():
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Veterinarian")
    vets = cursor.fetchall()
    cursor.close()
    connection.close()
    return jsonify(vets)
    
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
        ORDER BY a.Date, a.Time
    """
    cursor.execute(query)
    appointments = cursor.fetchall()
    cursor.close()
    connection.close()
    return jsonify(appointments)
    
@app.route('/api/appointments/<int:app_id>/complete', methods=['POST'])
def complete_visit(app_id):
    data = request.get_json()
    connection = create_db_connection()
    try:
        cursor = connection.cursor()
        sql_treatment = "INSERT INTO Treatment_Record (AppID, TreatmentID, Description, Medicine, Notes, Cost) VALUES (%s, %s, %s, %s, %s, %s)"
        cursor.execute(sql_treatment, (app_id, 1, data['description'], data['medicine'], data['notes'], data['cost']))
        cursor.execute("UPDATE Appointment SET Status = 'Completed' WHERE AppID = %s", (app_id,))
        sql_billing = "INSERT INTO Billing (AppID, BillID, Amount, Date, Status) VALUES (%s, %s, %s, CURDATE(), 'Unpaid')"
        cursor.execute(sql_billing, (app_id, 1, data['cost']))
        connection.commit()
        return jsonify({'message': 'Visit completed and bill generated successfully!'})
    except Error as e:
        connection.rollback()
        return jsonify({'message': f'Transaction failed: {e}'}), 500
    finally:
        cursor.close()
        connection.close()

# == Billing Management (NEW Endpoints) ==
@app.route('/api/billing', methods=['GET'])
def get_bills():
    """Functionality: View Billing History"""
    connection = create_db_connection()
    cursor = connection.cursor(dictionary=True)
    # Query to get unpaid bills with client and pet names
    query = """
        SELECT b.BillID, b.Amount, b.Date, b.Status, o.FirstName, o.LastName, p.Name as PetName
        FROM Billing b
        JOIN Appointment a ON b.AppID = a.AppID
        JOIN Pet p ON a.PetID = p.PetID
        JOIN Owner o ON p.OwnerID = o.OwnerID
        WHERE b.Status = 'Unpaid'
        ORDER BY b.Date DESC
    """
    cursor.execute(query)
    bills = cursor.fetchall()
    cursor.close()
    connection.close()
    return jsonify(bills)

@app.route('/api/billing/<int:bill_id>/pay', methods=['PUT'])
def process_payment(bill_id):
    """Functionality: Process a Payment"""
    connection = create_db_connection()
    cursor = connection.cursor()
    cursor.execute("UPDATE Billing SET Status = 'Paid' WHERE BillID = %s", (bill_id,))
    connection.commit()
    cursor.close()
    connection.close()
    return jsonify({'message': 'Payment processed successfully!'})

if __name__ == '__main__':
    app.run(debug=True, port=5001)