from flask import Flask, request, jsonify, render_template
import mysql.connector
from mysql.connector import Error

# --- Flask App Initialization ---
app = Flask(__name__)

# --- Database Connection Configuration ---
def create_db_connection():
    try:
        # IMPORTANT: Change 'your_password' to your actual MySQL root password
        connection = mysql.connector.connect(
            host='localhost',
            user='root',
            password='Y9mc92034', 
            database='pet_clinic_db'
        )
        return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

# --- HTML Rendering ---
@app.route('/')
def home():
    """Renders the main HTML page."""
    return render_template('index.html')

# --- API ENDPOINTS ---

# == Owner Management ==
@app.route('/api/owners', methods=['POST'])
def add_owner():
    """Functionality: Register New Owner"""
    data = request.get_json()
    connection = create_db_connection()
    if connection:
        cursor = connection.cursor()
        sql = "INSERT INTO Owner (FirstName, LastName, Phone, Address) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (data['firstName'], data['lastName'], data['phone'], data['address']))
        connection.commit()
        owner_id = cursor.lastrowid
        cursor.close()
        connection.close()
        return jsonify({'message': 'Owner added successfully!', 'ownerId': owner_id}), 201
    return jsonify({'message': 'Database connection failed'}), 500

@app.route('/api/owners', methods=['GET'])
def get_owners():
    """Functionality: View All Owners"""
    connection = create_db_connection()
    if connection:
        cursor = connection.cursor(dictionary=True)
        query = "SELECT * FROM Owner ORDER BY FirstName"
        cursor.execute(query)
        owners = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(owners)
    return jsonify({'message': 'Database connection failed'}), 500

# == Pet Management ==
@app.route('/api/pets', methods=['POST'])
def add_pet():
    """Functionality: Register New Pet"""
    data = request.get_json()
    connection = create_db_connection()
    if connection:
        cursor = connection.cursor()
        sql = "INSERT INTO Pet (Name, Species, Breed, Age, OwnerID) VALUES (%s, %s, %s, %s, %s)"
        cursor.execute(sql, (data['name'], data['species'], data['breed'], data['age'], data['ownerId']))
        connection.commit()
        cursor.close()
        connection.close()
        return jsonify({'message': 'Pet added successfully!'}), 201
    return jsonify({'message': 'Database connection failed'}), 500

@app.route('/api/owners/<int:owner_id>/pets', methods=['GET'])
def get_pets_for_owner(owner_id):
    """Functionality: View All Pets of an Owner"""
    connection = create_db_connection()
    if connection:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Pet WHERE OwnerID = %s", (owner_id,))
        pets = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(pets)
    return jsonify({'message': 'Database connection failed'}), 500

# == Veterinarian Management ==
@app.route('/api/veterinarians', methods=['GET'])
def get_veterinarians():
    """Functionality: View All Veterinarians"""
    connection = create_db_connection()
    if connection:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Veterinarian")
        vets = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(vets)
    return jsonify({'message': 'Database connection failed'}), 500

# == Appointment Scheduling ==
@app.route('/api/appointments', methods=['POST'])
def book_appointment():
    """Functionality: Book an Appointment"""
    data = request.get_json()
    connection = create_db_connection()
    if connection:
        cursor = connection.cursor()
        sql = "INSERT INTO Appointment (PetID, VetID, Date, Time, Reason) VALUES (%s, %s, %s, %s, %s)"
        cursor.execute(sql, (data['petId'], data['vetId'], data['date'], data['time'], data['reason']))
        connection.commit()
        cursor.close()
        connection.close()
        return jsonify({'message': 'Appointment booked successfully!'}), 201
    return jsonify({'message': 'Database connection failed'}), 500

@app.route('/api/appointments', methods=['GET'])
def get_appointments():
    """Functionality: View Schedule"""
    connection = create_db_connection()
    if connection:
        cursor = connection.cursor(dictionary=True)
        # A more complex query to get all necessary info for the schedule view
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
    return jsonify({'message': 'Database connection failed'}), 500

@app.route('/api/appointments/<int:app_id>/status', methods=['PUT'])
def update_appointment_status(app_id):
    """Functionality: Update Appointment Status"""
    data = request.get_json()
    connection = create_db_connection()
    if connection:
        cursor = connection.cursor()
        cursor.execute("UPDATE Appointment SET Status = %s WHERE AppID = %s", (data['status'], app_id))
        connection.commit()
        cursor.close()
        connection.close()
        return jsonify({'message': 'Appointment status updated successfully!'})
    return jsonify({'message': 'Database connection failed'}), 500

# == Clinical Visit & Automated Billing (Complex Workflow) ==
@app.route('/api/appointments/<int:app_id>/complete', methods=['POST'])
def complete_visit(app_id):
    """Functionality: Record Treatment and Auto-Generate Bill"""
    data = request.get_json()
    connection = create_db_connection()
    if connection:
        try:
            cursor = connection.cursor()
            # 1. Record Treatment Details
            sql_treatment = """
                INSERT INTO Treatment_Record (AppID, TreatmentID, Description, Medicine, Notes, Cost) 
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            # Using a simple TreatmentID of 1 for this example
            cursor.execute(sql_treatment, (app_id, 1, data['description'], data['medicine'], data['notes'], data['cost']))
            
            # 2. Update Appointment Status to 'Completed'
            cursor.execute("UPDATE Appointment SET Status = 'Completed' WHERE AppID = %s", (app_id,))

            # 3. Auto-Generate the Bill
            sql_billing = """
                INSERT INTO Billing (AppID, BillID, Amount, Date, Status) 
                VALUES (%s, %s, %s, CURDATE(), 'Unpaid')
            """
            # Using a simple BillID of 1 for this example
            cursor.execute(sql_billing, (app_id, 1, data['cost']))
            
            connection.commit()
            return jsonify({'message': 'Visit completed and bill generated successfully!'})
        except Error as e:
            connection.rollback()
            return jsonify({'message': f'Transaction failed: {e}'}), 500
        finally:
            cursor.close()
            connection.close()
    return jsonify({'message': 'Database connection failed'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5001)