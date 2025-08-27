document.addEventListener('DOMContentLoaded', function() {
    // --- Element Selections ---
    const addOwnerForm = document.getElementById('add-owner-form');
    const ownerTableBody = document.querySelector('#owner-table tbody');
    const apptOwnerSelect = document.getElementById('appt-owner-select');
    const apptPetSelect = document.getElementById('appt-pet-select');
    const apptVetSelect = document.getElementById('appt-vet-select');
    const bookAppointmentForm = document.getElementById('book-appointment-form');
    const scheduleTableBody = document.querySelector('#schedule-table tbody');

    // Modals
    const addPetModal = document.getElementById('add-pet-modal');
    const addPetForm = document.getElementById('add-pet-form');
    const completeVisitModal = document.getElementById('complete-visit-modal');
    const completeVisitForm = document.getElementById('complete-visit-form');

    const API_BASE_URL = 'http://127.0.0.1:5001/api';

    // --- Data Fetching and Rendering ---

    async function fetchAndRenderOwners() {
        const response = await fetch(`${API_BASE_URL}/owners`);
        const owners = await response.json();
        ownerTableBody.innerHTML = '';
        owners.forEach(owner => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${owner.FirstName} ${owner.LastName}</td>
                <td>${owner.Phone}</td>
                <td>${owner.Address}</td>
                <td><button class="action-button" data-owner-id="${owner.OwnerID}" data-owner-name="${owner.FirstName} ${owner.LastName}">Add Pet</button></td>
            `;
            ownerTableBody.appendChild(row);
        });
    }

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
        // Populate Owners
        const ownerResponse = await fetch(`${API_BASE_URL}/owners`);
        const owners = await ownerResponse.json();
        apptOwnerSelect.innerHTML = '<option value="">-- Select Owner --</option>';
        owners.forEach(owner => {
            apptOwnerSelect.innerHTML += `<option value="${owner.OwnerID}">${owner.FirstName} ${owner.LastName}</option>`;
        });

        // Populate Vets
        const vetResponse = await fetch(`${API_BASE_URL}/veterinarians`);
        const vets = await vetResponse.json();
        apptVetSelect.innerHTML = '<option value="">-- Select Veterinarian --</option>';
        vets.forEach(vet => {
            apptVetSelect.innerHTML += `<option value="${vet.VetID}">${vet.Name}</option>`;
        });
    }
    
    // --- Event Listeners ---

    addOwnerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
        };
        const response = await fetch(`${API_BASE_URL}/owners`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        if (response.ok) {
            alert('Owner added!');
            addOwnerForm.reset();
            fetchAndRenderOwners();
            populateAppointmentDropdowns();
        } else {
            alert('Failed to add owner.');
        }
    });
    
    apptOwnerSelect.addEventListener('change', async (e) => {
        const ownerId = e.target.value;
        apptPetSelect.innerHTML = '<option value="">-- Select Pet --</option>';
        if (ownerId) {
            const response = await fetch(`${API_BASE_URL}/owners/${ownerId}/pets`);
            const pets = await response.json();
            pets.forEach(pet => {
                apptPetSelect.innerHTML += `<option value="${pet.PetID}">${pet.Name}</option>`;
            });
        }
    });

    bookAppointmentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            petId: document.getElementById('appt-pet-select').value,
            vetId: document.getElementById('appt-vet-select').value,
            date: document.getElementById('appt-date').value,
            time: document.getElementById('appt-time').value,
            reason: document.getElementById('appt-reason').value,
        };
        const response = await fetch(`${API_BASE_URL}/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        if (response.ok) {
            alert('Appointment booked!');
            bookAppointmentForm.reset();
            fetchAndRenderAppointments();
        } else {
            alert('Failed to book appointment.');
        }
    });

    // Event delegation for modal buttons
    document.body.addEventListener('click', (e) => {
        if (e.target.matches('.action-button[data-owner-id]')) {
            document.getElementById('pet-owner-id').value = e.target.dataset.ownerId;
            document.getElementById('pet-owner-name').textContent = e.target.dataset.ownerName;
            addPetModal.showModal();
        }
        if (e.target.matches('.action-button.complete')) {
            document.getElementById('complete-appt-id').value = e.target.dataset.apptId;
            document.getElementById('visit-appt-id').textContent = e.target.dataset.apptId;
            completeVisitModal.showModal();
        }
    });
    
    // Modal form submissions and closing
    document.getElementById('close-pet-modal').addEventListener('click', () => addPetModal.close());
    document.getElementById('close-visit-modal').addEventListener('click', () => completeVisitModal.close());

    addPetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            name: document.getElementById('pet-name').value,
            species: document.getElementById('pet-species').value,
            breed: document.getElementById('pet-breed').value,
            age: document.getElementById('pet-age').value,
            ownerId: document.getElementById('pet-owner-id').value,
        };
        const response = await fetch(`${API_BASE_URL}/pets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        if (response.ok) {
            alert('Pet added successfully!');
            addPetForm.reset();
            addPetModal.close();
            // In a real app, you might want to refresh the owner's pet list here
        } else {
            alert('Failed to add pet.');
        }
    });

    completeVisitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const appId = document.getElementById('complete-appt-id').value;
        const formData = {
            description: document.getElementById('visit-description').value,
            medicine: document.getElementById('visit-medicine').value,
            notes: document.getElementById('visit-notes').value,
            cost: document.getElementById('visit-cost').value,
        };
        const response = await fetch(`${API_BASE_URL}/appointments/${appId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        if (response.ok) {
            alert('Visit completed and bill generated!');
            completeVisitForm.reset();
            completeVisitModal.close();
            fetchAndRenderAppointments();
        } else {
            alert('Failed to complete visit.');
        }
    });

    // --- Initial Load ---
    function initialize() {
        fetchAndRenderOwners();
        populateAppointmentDropdowns();
        fetchAndRenderAppointments();
    }

    initialize();
});