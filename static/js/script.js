document.addEventListener('DOMContentLoaded', function() {
    const API_BASE_URL = 'http://127.0.0.1:5001/api';

    // --- Page specific logic ---
    const page = document.body.id || window.location.pathname.split('/').pop().split('.')[0];

    if (document.querySelector('#schedule-view')) {
        initializeSchedulePage();
    }
    if (document.querySelector('#owner-management')) {
        initializeOwnerPage();
    }
    if (document.querySelector('#billing-management')) {
        initializeBillingPage();
    }

    // --- INITIALIZERS ---
    function initializeSchedulePage() {
        const scheduleTableBody = document.querySelector('#schedule-table tbody');
        const bookAppointmentForm = document.getElementById('book-appointment-form');
        const apptOwnerSelect = document.getElementById('appt-owner-select');
        const apptPetSelect = document.getElementById('appt-pet-select');
        const apptVetSelect = document.getElementById('appt-vet-select');
        const completeVisitModal = document.getElementById('complete-visit-modal');
        
        async function fetchAndRenderAppointments() {
            const response = await fetch(`${API_BASE_URL}/appointments`);
            const appointments = await response.json();
            scheduleTableBody.innerHTML = '';
            appointments.forEach(appt => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${new Date(appt.Date).toLocaleDateString()} ${appt.Time}</td>
                    <td>${appt.PetName}</td>
                    <td>${appt.FirstName} ${appt.LastName}</td>
                    <td>${appt.VetName}</td>
                    <td>${appt.Reason}</td>
                    <td>${appt.Status}</td>
                    <td>
                        ${appt.Status === 'Scheduled' ? `<button class="action-button complete" data-appt-id="${appt.AppID}">Complete Visit</button>` : ''}
                    </td>
                `;
                scheduleTableBody.appendChild(row);
            });
        }

        async function populateAppointmentDropdowns() {
            const [ownerRes, vetRes] = await Promise.all([
                fetch(`${API_BASE_URL}/owners`),
                fetch(`${API_BASE_URL}/veterinarians`)
            ]);
            const owners = await ownerRes.json();
            const vets = await vetRes.json();
            
            apptOwnerSelect.innerHTML = '<option value="">-- Select Owner --</option>';
            owners.forEach(owner => apptOwnerSelect.innerHTML += `<option value="${owner.OwnerID}">${owner.FirstName} ${owner.LastName}</option>`);
            
            apptVetSelect.innerHTML = '<option value="">-- Select Veterinarian --</option>';
            vets.forEach(vet => apptVetSelect.innerHTML += `<option value="${vet.VetID}">${vet.Name}</option>`);
        }

        apptOwnerSelect.addEventListener('change', async (e) => {
            const ownerId = e.target.value;
            apptPetSelect.innerHTML = '<option value="">-- Select Pet --</option>';
            if (ownerId) {
                const response = await fetch(`${API_BASE_URL}/owners/${ownerId}/pets`);
                const pets = await response.json();
                pets.forEach(pet => apptPetSelect.innerHTML += `<option value="${pet.PetID}">${pet.Name}</option>`);
            }
        });

        bookAppointmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                petId: document.getElementById('appt-pet-select').value, vetId: document.getElementById('appt-vet-select').value,
                date: document.getElementById('appt-date').value, time: document.getElementById('appt-time').value,
                reason: document.getElementById('appt-reason').value,
            };
            const response = await fetch(`${API_BASE_URL}/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            if (response.ok) {
                alert('Appointment booked!');
                bookAppointmentForm.reset();
                fetchAndRenderAppointments();
            } else { alert('Failed to book appointment.'); }
        });

        if(completeVisitModal) {
            const completeVisitForm = document.getElementById('complete-visit-form');
            completeVisitForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const appId = document.getElementById('complete-appt-id').value;
                const formData = {
                    description: document.getElementById('visit-description').value, medicine: document.getElementById('visit-medicine').value,
                    notes: document.getElementById('visit-notes').value, cost: document.getElementById('visit-cost').value,
                };
                const response = await fetch(`${API_BASE_URL}/appointments/${appId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                if (response.ok) {
                    alert('Visit completed and bill generated!');
                    completeVisitForm.reset();
                    completeVisitModal.close();
                    fetchAndRenderAppointments();
                } else { alert('Failed to complete visit.'); }
            });
        }

        populateAppointmentDropdowns();
        fetchAndRenderAppointments();
    }

    function initializeOwnerPage() {
        const addOwnerForm = document.getElementById('add-owner-form');
        const ownerTableBody = document.querySelector('#owner-table tbody');
        const addPetModal = document.getElementById('add-pet-modal');
        const addPetForm = document.getElementById('add-pet-form');

        async function fetchAndRenderOwners() {
            const response = await fetch(`${API_BASE_URL}/owners`);
            const owners = await response.json();
            ownerTableBody.innerHTML = '';
            owners.forEach(owner => {
                const row = document.createElement('tr');
                // BUG FIX: Ensure data-owner-name is correctly formatted with both names
                row.innerHTML = `
                    <td>${owner.FirstName} ${owner.LastName}</td>
                    <td>${owner.Phone}</td>
                    <td>${owner.Address}</td>
                    <td><button class="action-button" data-owner-id="${owner.OwnerID}" data-owner-name="${owner.FirstName} ${owner.LastName}">Add Pet</button></td>
                `;
                ownerTableBody.appendChild(row);
            });
        }
        
        addOwnerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                firstName: document.getElementById('firstName').value, lastName: document.getElementById('lastName').value,
                phone: document.getElementById('phone').value, address: document.getElementById('address').value,
            };
            const response = await fetch(`${API_BASE_URL}/owners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            if (response.ok) {
                alert('Owner added!');
                addOwnerForm.reset();
                fetchAndRenderOwners();
            } else { alert('Failed to add owner.'); }
        });

        if (addPetModal) {
            addPetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = {
                    name: document.getElementById('pet-name').value, species: document.getElementById('pet-species').value,
                    breed: document.getElementById('pet-breed').value, age: document.getElementById('pet-age').value,
                    // BUG FIX: Correctly get the ownerId from the hidden input
                    ownerId: document.getElementById('pet-owner-id').value,
                };
                const response = await fetch(`${API_BASE_URL}/pets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                if (response.ok) {
                    alert('Pet added successfully!');
                    addPetForm.reset();
                    addPetModal.close();
                } else { alert('Failed to add pet.'); }
            });
        }
        
        fetchAndRenderOwners();
    }

    function initializeBillingPage() {
        const billingTableBody = document.querySelector('#billing-table tbody');
        
        async function fetchAndRenderBills() {
            const response = await fetch(`${API_BASE_URL}/billing`);
            const bills = await response.json();
            billingTableBody.innerHTML = '';
            bills.forEach(bill => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${new Date(bill.Date).toLocaleDateString()}</td>
                    <td>${bill.FirstName} ${bill.LastName}</td>
                    <td>${bill.PetName}</td>
                    <td>$${bill.Amount.toFixed(2)}</td>
                    <td><button class="action-button" data-bill-id="${bill.BillID}">Mark as Paid</button></td>
                `;
                billingTableBody.appendChild(row);
            });
        }
        
        fetchAndRenderBills();

        billingTableBody.addEventListener('click', async (e) => {
            if (e.target.matches('.action-button[data-bill-id]')) {
                const billId = e.target.dataset.billId;
                const response = await fetch(`${API_BASE_URL}/billing/${billId}/pay`, { method: 'PUT' });
                if (response.ok) {
                    alert('Payment processed!');
                    fetchAndRenderBills(); // Refresh the list
                } else {
                    alert('Failed to process payment.');
                }
            }
        });
    }

    // --- Global Event Listeners for Modals ---
    document.body.addEventListener('click', (e) => {
        // Owner Page: Add Pet button
        if (e.target.matches('#owner-table .action-button[data-owner-id]')) {
            const addPetModal = document.getElementById('add-pet-modal');
            // BUG FIX: Correctly set the owner ID and name in the modal before showing it
            document.getElementById('pet-owner-id').value = e.target.dataset.ownerId;
            document.getElementById('pet-owner-name').textContent = e.target.dataset.ownerName;
            addPetModal.showModal();
        }
        // Schedule Page: Complete Visit button
        if (e.target.matches('#schedule-table .action-button.complete')) {
            const completeVisitModal = document.getElementById('complete-visit-modal');
            document.getElementById('complete-appt-id').value = e.target.dataset.apptId;
            document.getElementById('visit-appt-id').textContent = e.target.dataset.apptId;
            completeVisitModal.showModal();
        }
        // General: Close modal buttons
        if (e.target.matches('.close-modal-btn')) {
            e.target.closest('dialog').close();
        }
    });
});