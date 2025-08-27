from flask import Flask, request, jsonify, render_template
import mysql.connector
from mysql.connector import Error
import time

app = Flask(__name__)

# --- Database Connection Configuration ---
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
    return render_template('index.html')

@app.route('/owners')
def owners_page():
    return render_template('owners.html')

@app.route('/billing')
def billing_page():
    return render_template('billing.html')

# --- API ENDPOINTS ---
# Owner, Pet, Vet, and Appointment routes remain the same...

@app.route('/api/owners', methods=['POST'])
def add_owner():
    data = request.get_json()
    connection = create_db_connection()
    if not connection: return jsonify({'message': 'Database connection failed'}), 500
    try:
        cursor = connection.cursor()
        sql_owner = "INSERT INTO Owner (FirstName, LastName, Phone, Address) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql_owner, (data['firstName'], data['lastName'], data['phone'], data['address']))
        owner_id = cursor.lastrowid
        if data.get('email'):
            sql_email = "INSERT INTO Owner_Email (OwnerID, Email) VALUES (%s, %s)"
            cursor.execute(sql_email, (owner_id, data['email']))
        connection.commit()
        return jsonify({'message': 'Owner added successfully!', 'ownerId': owner_id}), 201
    except Error as e:
        connection.rollback()
        return jsonify({'message': f'Failed to add owner: {e}'}), 500
    finally:
        cursor.close()
        connection.close()

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
        cursor.close()
        connection.close()

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
        if bill.get('Date'): bill['Date'] = bill.get('Date').isoformat()
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