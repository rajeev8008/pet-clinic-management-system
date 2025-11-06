document.addEventListener('DOMContentLoaded', function() {
    const API_BASE_URL = '/api';
    
    // validation helpers
    function validateEmail(email) {
        if (!email) return true; // optional field
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    function validatePhone(phone) {
        if (!phone) return false;
        const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
        const re = /^\+?\d{7,15}$/;
        return re.test(cleaned);
    }
    
    // --- UI helpers: global message, field errors, loading indicator ---
    function showGlobalMessage(text, type = 'success', timeout = 4000) {
        const el = document.getElementById('global-message');
        if (!el) return;
        el.className = ''; // clear
        el.classList.add(type === 'error' ? 'error' : 'success');
        el.textContent = text;
        el.classList.remove('hidden');
        if (timeout) setTimeout(() => el.classList.add('hidden'), timeout);
    }

    function showFieldError(fieldId, message) {
        const err = document.getElementById(`error-${fieldId}`);
        if (!err) return;
        err.textContent = message;
        err.classList.add('visible');
    }

    function clearFieldErrors(formRoot = document) {
        formRoot.querySelectorAll('.field-error').forEach(e => { e.textContent = ''; e.classList.remove('visible'); });
    }

    function showLoading() { const o = document.getElementById('loading-overlay'); if (o) o.classList.remove('hidden'); }
    function hideLoading() { const o = document.getElementById('loading-overlay'); if (o) o.classList.add('hidden'); }

    // --- Page specific logic ---
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
        const removeApptModal = document.getElementById('remove-appointment-modal');
        const appointmentsToggle = document.getElementById('appointments-toggle');
        const appointmentsContent = document.getElementById('appointments-content');
        const apptCount = document.getElementById('appt-count');
        
        async function fetchAndRenderAppointments() {
            const response = await fetch(`${API_BASE_URL}/appointments`);
            const appointments = await response.json();
            apptCount.textContent = `(${appointments.length})`;
            scheduleTableBody.innerHTML = '';
            appointments.forEach(appt => {
                const row = document.createElement('tr');
                let actions = '';
                if (appt.Status === 'Scheduled') {
                    actions = `<button class="action-button complete" data-appt-id="${appt.AppID}">Complete Visit</button>`;
                } else if (appt.Status === 'Completed') {
                    actions = `<button class="action-button remove" data-appt-id="${appt.AppID}">Remove</button>`;
                }
                row.innerHTML = `
                    <td>${new Date(appt.Date).toLocaleDateString()} ${appt.Time}</td>
                    <td>${appt.PetName}</td>
                    <td>${appt.FirstName} ${appt.LastName}</td>
                    <td>${appt.VetName}</td>
                    <td>${appt.Reason}</td>
                    <td>${appt.Status}</td>
                    <td>${actions}</td>
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
            apptVetSelect.innerHTML = '<option value="">-- Select Veterinarian --</option>';
            if (ownerId) {
                const response = await fetch(`${API_BASE_URL}/owners/${ownerId}/pets`);
                const pets = await response.json();
                pets.forEach(pet => apptPetSelect.innerHTML += `<option value="${pet.PetID}">${pet.Name}</option>`);
            }
        });

        apptPetSelect.addEventListener('change', async (e) => {
            const petId = e.target.value;
            apptVetSelect.innerHTML = '<option value="">-- Select Veterinarian --</option>';
            if (petId) {
                const response = await fetch(`${API_BASE_URL}/pets/${petId}/vets`);
                const vets = await response.json();
                let primaryVetId = null;
                vets.forEach(vet => {
                    apptVetSelect.innerHTML += `<option value="${vet.VetID}">${vet.Name}</option>`;
                    if (vet.is_primary_vet) {
                        primaryVetId = vet.VetID;
                    }
                });
                // Auto-select primary vet if exists
                if (primaryVetId) {
                    apptVetSelect.value = primaryVetId;
                }
            }
        });

        bookAppointmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFieldErrors(bookAppointmentForm);
            const formData = {
                petId: document.getElementById('appt-pet-select').value, vetId: document.getElementById('appt-vet-select').value,
                date: document.getElementById('appt-date').value, time: document.getElementById('appt-time').value,
                reason: document.getElementById('appt-reason').value,
            };
            // basic client-side validation
            let valid = true;
            if (!formData.date) { showFieldError('appt-date', 'Date is required'); valid = false; }
            if (!formData.time) { showFieldError('appt-time', 'Time is required'); valid = false; }
            if (!formData.reason) { showFieldError('appt-reason', 'Reason is required'); valid = false; }
            if (!valid) return;
            showLoading();
            const response = await fetch(`${API_BASE_URL}/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            hideLoading();
            if (response.ok) {
                showGlobalMessage('Appointment booked!', 'success');
                bookAppointmentForm.reset();
                fetchAndRenderAppointments();
            } else {
                const err = await response.json().catch(() => ({}));
                showGlobalMessage(err.message || 'Failed to book appointment.', 'error');
            }
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
                hideLoading();
                if (response.ok) {
                    showGlobalMessage('Visit completed and bill generated!', 'success');
                    completeVisitForm.reset();
                    completeVisitModal.close();
                    fetchAndRenderAppointments();
                } else {
                    const error = await response.json().catch(() => ({}));
                    showGlobalMessage(`Failed to complete visit: ${error.message || 'Unknown error'}`, 'error');
                }
            });
        }

        // Remove Appointment Modal Handler
        if(removeApptModal) {
            const removeApptForm = document.getElementById('remove-appointment-form');
            removeApptForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const appId = document.getElementById('remove-appt-id-hidden').value;
                showLoading();
                const response = await fetch(`${API_BASE_URL}/appointments/${appId}`, { method: 'DELETE' });
                hideLoading();
                if (response.ok) {
                    showGlobalMessage('Appointment removed successfully!', 'success');
                    removeApptForm.reset();
                    removeApptModal.close();
                    fetchAndRenderAppointments();
                } else {
                    const error = await response.json().catch(() => ({}));
                    showGlobalMessage(error.message || 'Failed to remove appointment', 'error');
                }
            });
        }

        // Collapsible Toggle Handler
        if(appointmentsToggle) {
            appointmentsToggle.addEventListener('click', () => {
                appointmentsToggle.classList.toggle('collapsed');
                appointmentsContent.classList.toggle('collapsed');
            });
        }

        // --- FILTER FUNCTIONALITY FOR APPOINTMENTS ---
        // Store all appointments for filtering
        let allAppointments = [];
        const originalFetchAndRenderAppointments = fetchAndRenderAppointments;
        fetchAndRenderAppointments = async function() {
            const response = await fetch(`${API_BASE_URL}/appointments`);
            allAppointments = await response.json();
            apptCount.textContent = `(${allAppointments.length})`;
            scheduleTableBody.innerHTML = '';
            allAppointments.forEach(appt => renderAppointmentRow(appt));
        };

        function renderAppointmentRow(appt) {
            const row = document.createElement('tr');
            let actions = '';
            if (appt.Status === 'Scheduled') {
                actions = `<button class="action-button complete" data-appt-id="${appt.AppID}">Complete Visit</button>`;
            } else if (appt.Status === 'Completed') {
                actions = `<button class="action-button remove" data-appt-id="${appt.AppID}">Remove</button>`;
            }
            row.innerHTML = `
                <td>${new Date(appt.Date).toLocaleDateString()} ${appt.Time}</td>
                <td>${appt.PetName}</td>
                <td>${appt.FirstName} ${appt.LastName}</td>
                <td>${appt.VetName}</td>
                <td>${appt.Reason}</td>
                <td>${appt.Status}</td>
                <td>${actions}</td>
            `;
            row.dataset.date = appt.Date;
            row.dataset.status = appt.Status;
            scheduleTableBody.appendChild(row);
        }

        const apptDateFilter = document.getElementById('appt-date-filter');
        const apptStatusFilter = document.getElementById('appt-status-filter');

        function applyAppointmentFilters() {
            const selectedDate = apptDateFilter ? apptDateFilter.value : '';
            const selectedStatus = apptStatusFilter ? apptStatusFilter.value : '';
            
            const rows = scheduleTableBody.querySelectorAll('tr');
            let visibleCount = 0;
            
            rows.forEach(row => {
                let showRow = true;
                
                if (selectedDate) {
                    const rowDate = row.dataset.date.split('T')[0];
                    const filterDate = selectedDate;
                    showRow = showRow && (rowDate === filterDate);
                }
                
                if (selectedStatus) {
                    showRow = showRow && (row.dataset.status === selectedStatus);
                }
                
                row.style.display = showRow ? '' : 'none';
                if (showRow) visibleCount++;
            });
            
            apptCount.textContent = `(${visibleCount})`;
        }

        if (apptDateFilter) {
            apptDateFilter.addEventListener('change', applyAppointmentFilters);
        }
        if (apptStatusFilter) {
            apptStatusFilter.addEventListener('change', applyAppointmentFilters);
        }

        // Event delegation for Remove button
        scheduleTableBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove')) {
                const appId = e.target.dataset.apptId;
                removeApptModal.showModal();
                document.getElementById('remove-appt-id').textContent = appId;
                document.getElementById('remove-appt-id-hidden').value = appId;
            }
        });

        populateAppointmentDropdowns();
        fetchAndRenderAppointments();
    }

    function initializeOwnerPage() {
        const addOwnerForm = document.getElementById('add-owner-form');
        const ownerTableBody = document.querySelector('#owner-table tbody');
        const addPetModal = document.getElementById('add-pet-modal');
        const addPetForm = document.getElementById('add-pet-form');
        const petDetailsContainer = document.getElementById('pet-details-container');
        const petTableBody = document.querySelector('#pet-table tbody');
        const manageVetsModal = document.getElementById('manage-vets-modal');
        const manageVetsForm = document.getElementById('manage-vets-form');

        async function fetchAndRenderOwners() {
            const response = await fetch(`${API_BASE_URL}/owners`);
            const owners = await response.json();
            ownerTableBody.innerHTML = '';
            owners.forEach(owner => {
                const row = document.createElement('tr');
                row.dataset.ownerId = owner.OwnerID;
                row.dataset.ownerName = `${owner.FirstName} ${owner.LastName}`;
                row.innerHTML = `
                    <td>${owner.FirstName} ${owner.LastName}</td>
                    <td>${owner.Phone}</td>
                    <td>${owner.Address}</td>
                    <td>
                      <button class="action-button edit-owner" data-owner-id="${owner.OwnerID}">Edit</button>
                      <button class="action-button delete-owner" data-owner-id="${owner.OwnerID}">Delete</button>
                      <button class="action-button add-pet" data-owner-id="${owner.OwnerID}" data-owner-name="${owner.FirstName} ${owner.LastName}">Add Pet</button>
                    </td>
                `;
                ownerTableBody.appendChild(row);
            });
        }
        
        async function showPetsForOwner(ownerId, ownerName) {
            document.querySelectorAll('#owner-table tr.selected').forEach(r => r.classList.remove('selected'));
            document.querySelector(`#owner-table tr[data-owner-id='${ownerId}']`).classList.add('selected');

            petDetailsContainer.classList.remove('hidden');
            document.getElementById('selected-owner-name').textContent = ownerName;
            
            const response = await fetch(`${API_BASE_URL}/owners/${ownerId}/pets`);
            const pets = await response.json();
            petTableBody.innerHTML = '';
            pets.forEach(pet => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${pet.Name}</td>
                    <td>${pet.Species}</td>
                    <td>${pet.Breed}</td>
                    <td>${new Date(pet.DoB).toLocaleDateString()}</td>
                    <td>${pet.Age}</td>
                    <td>
                      <button class="action-button view-history" data-pet-id="${pet.PetID}" data-pet-name="${pet.Name}">View History</button>
                      <button class="action-button manage-vets" data-pet-id="${pet.PetID}" data-pet-name="${pet.Name}">Manage Vets</button>
                      <button class="action-button edit-pet" data-pet-id="${pet.PetID}" data-pet-name="${pet.Name}">Edit</button>
                      <button class="action-button delete-pet" data-pet-id="${pet.PetID}">Delete</button>
                    </td>
                `;
                petTableBody.appendChild(row);
            });
        }
        
        ownerTableBody.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (!row || e.target.matches('button')) return;
            showPetsForOwner(row.dataset.ownerId, row.dataset.ownerName);
        });

        addOwnerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFieldErrors(addOwnerForm);
            const formData = {
                firstName: document.getElementById('firstName').value, lastName: document.getElementById('lastName').value,
                phone: document.getElementById('phone').value, email: document.getElementById('email').value,
                address: document.getElementById('address').value,
            };
            // Add client-side validation before submit
            let valid = true;
            if (!formData.firstName) { showFieldError('firstName', 'First name required'); valid = false; }
            if (!formData.lastName) { showFieldError('lastName', 'Last name required'); valid = false; }
            if (!formData.phone) { showFieldError('phone', 'Phone is required'); valid = false; }
            else if (!validatePhone(formData.phone)) { showFieldError('phone', 'Invalid phone format (7–15 digits, optional +)'); valid = false; }
            if (formData.email && !validateEmail(formData.email)) { showFieldError('email', 'Invalid email format'); valid = false; }
            if (!formData.address) { showFieldError('address', 'Address is required'); valid = false; }
            if (!valid) return;

            showLoading();
            const response = await fetch(`${API_BASE_URL}/owners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            hideLoading();
            if (response.ok) {
                showGlobalMessage('Owner added!', 'success');
                addOwnerForm.reset();
                fetchAndRenderOwners();
            } else {
                const err = await response.json().catch(() => ({}));
                showGlobalMessage(err.message || 'Failed to add owner.', 'error');
            }
        });

        if (addPetModal) {
            addPetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = {
                    name: document.getElementById('pet-name').value, species: document.getElementById('pet-species').value,
                    breed: document.getElementById('pet-breed').value, dob: document.getElementById('pet-dob').value,
                    ownerId: document.getElementById('pet-owner-id').value,
                };
                const response = await fetch(`${API_BASE_URL}/pets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                if (response.ok) {
                    showGlobalMessage('Pet added successfully!', 'success');
                    addPetForm.reset();
                    addPetModal.close();
                    showPetsForOwner(formData.ownerId, document.getElementById('pet-owner-name').textContent);
                } else {
                    const err = await response.json().catch(() => ({}));
                    showGlobalMessage(err.message || 'Failed to add pet.', 'error');
                }
            });
        }

        if (manageVetsModal) {
            manageVetsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = {
                    petId: document.getElementById('manage-pet-id').value,
                    vetId: document.getElementById('vet-select').value,
                    isPrimary: Boolean(document.getElementById('is-primary-vet-checkbox').checked),
                };
                const response = await fetch(`${API_BASE_URL}/vet-pet-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                if (response.ok) {
                    showGlobalMessage('Vet assigned successfully!', 'success');
                    manageVetsModal.close();
                } else {
                    const err = await response.json().catch(() => ({}));
                    showGlobalMessage(err.message || 'Failed to assign vet.', 'error');
                }
            });
        }

        // Edit Owner Form Handler
        const editOwnerModal = document.getElementById('edit-owner-modal');
        const editOwnerForm = document.getElementById('edit-owner-form');
        if (editOwnerForm) {
            editOwnerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                clearFieldErrors(editOwnerForm);
                const ownerId = document.getElementById('edit-owner-id').value;
                const phone = document.getElementById('edit-owner-phone').value;
                
                if (!validatePhone(phone)) {
                    showFieldError('edit-owner-phone', 'Invalid phone format (7–15 digits, optional +)');
                    return;
                }
                
                showLoading();
                const response = await fetch(`${API_BASE_URL}/owners/${ownerId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: phone })
                });
                hideLoading();
                if (response.ok) {
                    showGlobalMessage('Owner updated successfully!', 'success');
                    editOwnerForm.reset();
                    editOwnerModal.close();
                    fetchAndRenderOwners();
                } else {
                    const err = await response.json().catch(() => ({}));
                    showGlobalMessage(err.message || 'Failed to update owner.', 'error');
                }
            });
        }

        // Edit Pet Form Handler
        const editPetModal = document.getElementById('edit-pet-modal');
        const editPetForm = document.getElementById('edit-pet-form');
        if (editPetForm) {
            editPetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const petId = document.getElementById('edit-pet-id').value;
                const breed = document.getElementById('edit-pet-breed').value;
                
                showLoading();
                const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ breed: breed })
                });
                hideLoading();
                if (response.ok) {
                    showGlobalMessage('Pet updated successfully!', 'success');
                    editPetForm.reset();
                    editPetModal.close();
                    const ownerId = document.querySelector('#owner-table tr.selected')?.dataset.ownerId;
                    if (ownerId) showPetsForOwner(ownerId, document.getElementById('selected-owner-name').textContent);
                } else {
                    const err = await response.json().catch(() => ({}));
                    showGlobalMessage(err.message || 'Failed to update pet.', 'error');
                }
            });
        }
        
        // Collapsible Toggle Handlers for Owner Page
        const clientsToggle = document.getElementById('clients-toggle');
        const clientsContent = document.getElementById('clients-content');
        const clientCount = document.getElementById('client-count');
        const petsToggle = document.getElementById('pets-toggle');
        const petsContent = document.getElementById('pets-content');
        const petCount = document.getElementById('pet-count');

        if(clientsToggle) {
            clientsToggle.addEventListener('click', () => {
                clientsToggle.classList.toggle('collapsed');
                clientsContent.classList.toggle('collapsed');
            });
            // Update client count
            ownerTableBody.addEventListener('change', () => {
                clientCount.textContent = `(${ownerTableBody.querySelectorAll('tr').length})`;
            });
        }

        if(petsToggle) {
            petsToggle.addEventListener('click', () => {
                petsToggle.classList.toggle('collapsed');
                petsContent.classList.toggle('collapsed');
            });
            // Update pet count
            petTableBody.addEventListener('change', () => {
                petCount.textContent = `(${petTableBody.querySelectorAll('tr').length})`;
            });
        }

        // Update counts when data is rendered
        function updateCounts() {
            clientCount.textContent = `(${ownerTableBody.querySelectorAll('tr').length})`;
            petCount.textContent = `(${petTableBody.querySelectorAll('tr').length})`;
        }

        // --- FILTER FUNCTIONALITY ---
        // Search owners by name or phone
        const ownerSearchInput = document.getElementById('owner-search-input');
        if (ownerSearchInput) {
            ownerSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const rows = ownerTableBody.querySelectorAll('tr');
                let visibleCount = 0;
                rows.forEach(row => {
                    const name = row.cells[0].textContent.toLowerCase();
                    const phone = row.cells[1].textContent.toLowerCase();
                    const matches = name.includes(searchTerm) || phone.includes(searchTerm);
                    row.style.display = matches ? '' : 'none';
                    if (matches) visibleCount++;
                });
                clientCount.textContent = `(${visibleCount})`;
            });
        }

        // Filter pets by species
        const petSpeciesFilter = document.getElementById('pet-species-filter');
        if (petSpeciesFilter) {
            petSpeciesFilter.addEventListener('change', (e) => {
                const filterSpecies = e.target.value.toLowerCase();
                const rows = petTableBody.querySelectorAll('tr');
                let visibleCount = 0;
                rows.forEach(row => {
                    const species = row.cells[1].textContent.toLowerCase();
                    const matches = !filterSpecies || species.includes(filterSpecies);
                    row.style.display = matches ? '' : 'none';
                    if (matches) visibleCount++;
                });
                petCount.textContent = `(${visibleCount})`;
            });
        }

        // Hook into existing render functions
        const originalFetchAndRenderOwners = fetchAndRenderOwners;
        fetchAndRenderOwners = async function() {
            await originalFetchAndRenderOwners();
            updateCounts();
        };
        
        fetchAndRenderOwners();
    }

    function initializeBillingPage() {
        const billingTableBody = document.querySelector('#billing-table tbody');
        const processPaymentModal = document.getElementById('process-payment-modal');
        const processPaymentForm = document.getElementById('process-payment-form');
        const billsToggle = document.getElementById('bills-toggle');
        const billsContent = document.getElementById('bills-content');
        const billsCount = document.getElementById('bills-count');
        
        // Store all bills for filtering
        let allBills = [];
        
        // Load and display billing statistics
        async function fetchAndRenderStats() {
            try {
                // Fetch all bills to calculate stats
                const billsResponse = await fetch(`${API_BASE_URL}/billing`);
                allBills = await billsResponse.json();
                
                let totalBills = 0;
                let paidCount = 0;
                let unpaidCount = 0;
                
                allBills.forEach(bill => {
                    totalBills++;
                    if (bill.Status === 'Paid') {
                        paidCount++;
                    } else if (bill.Status === 'Unpaid') {
                        unpaidCount++;
                    }
                });
                
                // Update stat cards
                document.getElementById('stat-total-bills').textContent = totalBills;
                document.getElementById('stat-paid-bills').textContent = paidCount;
                document.getElementById('stat-unpaid-bills').textContent = unpaidCount;
                
                // Update bills count
                if(billsCount) {
                    billsCount.textContent = `(${totalBills})`;
                }
            } catch (err) {
                console.error('Failed to load billing stats:', err);
            }
        }
        
        async function fetchAndRenderBills() {
            const response = await fetch(`${API_BASE_URL}/billing`);
            allBills = await response.json();
            renderBillsTable(allBills);
        }

        function renderBillsTable(bills) {
            billingTableBody.innerHTML = '';
            bills.forEach(bill => {
                const row = document.createElement('tr');
                let actionButton = '';
                if (bill.Status === 'Unpaid') {
                    actionButton = `<button class="action-button" data-app-id="${bill.AppID}" data-bill-id="${bill.BillID}" data-amount="${bill.Amount}">Process Payment</button>`;
                } else if (bill.Status === 'Paid') {
                    actionButton = `<button class="action-button delete-bill" data-bill-id="${bill.BillID}">Delete</button>`;
                }
                row.innerHTML = `
                    <td>${bill.BillID}</td>
                    <td>${new Date(bill.Date).toLocaleDateString()}</td>
                    <td>${bill.FirstName} ${bill.LastName}</td>
                    <td>${bill.PetName}</td>
                    <td>₹${Number(bill.Amount).toFixed(2)}</td>
                    <td>${bill.Status}</td>
                    <td>${bill.Mode || 'N/A'}</td>
                    <td>${actionButton}</td>
                `;
                row.dataset.status = bill.Status;
                row.dataset.billId = bill.BillID;
                billingTableBody.appendChild(row);
            });
            
            // Update count
            if(billsCount) {
                billsCount.textContent = `(${bills.length})`;
            }
        }
        
        // Collapsible Toggle Handler for Bills
        if(billsToggle) {
            billsToggle.addEventListener('click', () => {
                billsToggle.classList.toggle('collapsed');
                billsContent.classList.toggle('collapsed');
            });
        }

        // --- FILTER FUNCTIONALITY FOR BILLS ---
        const billStatusFilter = document.getElementById('bill-status-filter');
        if (billStatusFilter) {
            billStatusFilter.addEventListener('change', (e) => {
                const selectedStatus = e.target.value;
                const filteredBills = selectedStatus 
                    ? allBills.filter(bill => bill.Status === selectedStatus)
                    : allBills;
                renderBillsTable(filteredBills);
            });
        }
        
        // Load stats and bills
        fetchAndRenderStats();
        fetchAndRenderBills();

        billingTableBody.addEventListener('click', async (e) => {
            if (e.target.matches('.action-button[data-bill-id]:not(.delete-bill)')) {
                const appId = e.target.dataset.appId;
                const billId = e.target.dataset.billId;
                const amount = e.target.dataset.amount;
                
                // Populate payment modal with bill details
                document.getElementById('payment-app-id').value = appId;
                document.getElementById('payment-bill-id').value = billId;
                document.getElementById('payment-bill-display').textContent = billId;
                document.getElementById('payment-amount-display').textContent = '₹' + Number(amount).toFixed(2);
                document.getElementById('payment-mode').value = '';
                clearFieldErrors(processPaymentForm);
                processPaymentModal.showModal();
            }
            // Delete bill handler
            if (e.target.matches('.delete-bill')) {
                const billId = e.target.dataset.billId;
                const deleteBillModal = document.getElementById('delete-bill-modal');
                document.getElementById('delete-bill-id').textContent = billId;
                document.getElementById('delete-bill-id-hidden').value = billId;
                deleteBillModal.showModal();
            }
        });

        if (processPaymentForm) {
            processPaymentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                clearFieldErrors(processPaymentForm);
                
                const appId = document.getElementById('payment-app-id').value;
                const billId = document.getElementById('payment-bill-id').value;
                const mode = document.getElementById('payment-mode').value;
                
                if (!mode) {
                    showFieldError('payment-mode', 'Please select a payment mode');
                    return;
                }
                
                showLoading();
                const response = await fetch(`${API_BASE_URL}/billing/${appId}/${billId}/pay`, { 
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: mode })
                });
                hideLoading();
                if (response.ok) {
                    showGlobalMessage('Payment processed successfully!', 'success');
                    processPaymentForm.reset();
                    processPaymentModal.close();
                    fetchAndRenderBills();
                    fetchAndRenderStats();
                } else {
                    const err = await response.json().catch(() => ({}));
                    showGlobalMessage(err.message || 'Failed to process payment.', 'error');
                }
            });
        }

        // Delete Bill Form Handler
        const deleteBillModal = document.getElementById('delete-bill-modal');
        const deleteBillForm = document.getElementById('delete-bill-form');
        if (deleteBillForm) {
            deleteBillForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const billId = document.getElementById('delete-bill-id-hidden').value;
                
                showLoading();
                const response = await fetch(`${API_BASE_URL}/billing/${billId}`, {
                    method: 'DELETE'
                });
                hideLoading();
                
                if (response.ok) {
                    showGlobalMessage('Bill deleted successfully!', 'success');
                    deleteBillForm.reset();
                    deleteBillModal.close();
                    fetchAndRenderBills();
                    fetchAndRenderStats();
                } else {
                    const err = await response.json().catch(() => ({}));
                    showGlobalMessage(err.message || 'Failed to delete bill.', 'error');
                }
            });
        }
    }

    // --- Global Event Listeners ---
    document.body.addEventListener('click', async (e) => {
        // View pet history
        if (e.target.matches('.view-history')) {
            const petId = e.target.dataset.petId;
            const petName = e.target.dataset.petName;
            const modal = document.getElementById('pet-history-modal');
            const petInfo = document.getElementById('pet-info');
            const tbody = document.querySelector('#pet-history-table tbody');
            petInfo.innerHTML = `<strong>${petName}</strong>`;
            tbody.innerHTML = '';
            showLoading();
            try {
                const res = await fetch(`${API_BASE_URL}/pet-history/${petId}`);
                hideLoading();
                if (!res.ok) {
                    const err = await res.json().catch(()=>({message:'Failed to load history'}));
                    showGlobalMessage(err.message || 'Failed to load pet history', 'error');
                    return;
                }
                const rows = await res.json();
                if (rows.length > 0) {
                    const r0 = rows[0];
                    petInfo.innerHTML = `
                        <div><strong>Pet:</strong> ${r0.PetName} (${r0.Species} / ${r0.Breed})</div>
                        <div><strong>DOB:</strong> ${r0.DoB ? new Date(r0.DoB).toLocaleDateString() : ''}</div>
                        <div><strong>Owner:</strong> ${r0.FirstName} ${r0.LastName} — ${r0.OwnerPhone || ''}</div>
                    `;
                    rows.forEach(r => {
                        if (r.AppointmentDate) {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `<td>${new Date(r.AppointmentDate).toLocaleDateString()}</td><td>${r.Reason || ''}</td><td>${r.VetName || ''}</td>`;
                            tbody.appendChild(tr);
                        }
                    });
                } else {
                    petInfo.innerHTML = '<div>No history found for this pet.</div>';
                }
                modal.showModal();
            } catch (err) {
                hideLoading();
                showGlobalMessage('Network error while loading pet history', 'error');
            }
        }
        // Open "Add Pet" Modal
        if (e.target.matches('.action-button.add-pet')) {
            const addPetModal = document.getElementById('add-pet-modal');
            document.getElementById('pet-owner-id').value = e.target.dataset.ownerId;
            document.getElementById('pet-owner-name').textContent = e.target.dataset.ownerName;
            addPetModal.showModal();
        }
        // Open "Manage Vets" Modal
        if (e.target.matches('.action-button.manage-vets')) {
            const petId = e.target.dataset.petId;
            const petName = e.target.dataset.petName;
            const vetSelect = document.getElementById('vet-select');
            const assignedVetsList = document.getElementById('assigned-vets-list');
            const manageVetsModal = document.getElementById('manage-vets-modal');
            
            document.getElementById('manage-pet-id').value = petId;
            document.getElementById('manage-pet-name').textContent = petName;

            const [allVetsRes, assignedVetsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/veterinarians`),
                fetch(`${API_BASE_URL}/pets/${petId}/vets`)
            ]);
            const allVets = await allVetsRes.json();
            const assignedVets = await assignedVetsRes.json();
            
            vetSelect.innerHTML = '<option value="">-- Select a vet to assign --</option>';
            allVets.forEach(vet => {
                const isAssigned = assignedVets.find(av => av.VetID === vet.VetID);
                vetSelect.innerHTML += `<option value="${vet.VetID}">${vet.Name} ${isAssigned ? '(Already Assigned)' : ''}</option>`;
            });

            assignedVetsList.innerHTML = '<h4>Currently Assigned Vets:</h4>';
            if (assignedVets.length > 0) {
                let listHTML = '<ul>';
                assignedVets.forEach(vet => {
                    listHTML += `<li>${vet.Name} ${vet.is_primary_vet ? '<strong>(Primary)</strong>' : ''}</li>`;
                });
                listHTML += '</ul>';
                assignedVetsList.innerHTML += listHTML;
            } else {
                assignedVetsList.innerHTML += '<p>No vets assigned yet.</p>';
            }

            manageVetsModal.showModal();
        }
        // Open "Complete Visit" Modal
        if (e.target.matches('.action-button.complete')) {
            const completeVisitModal = document.getElementById('complete-visit-modal');
            document.getElementById('complete-appt-id').value = e.target.dataset.apptId;
            document.getElementById('visit-appt-id').textContent = e.target.dataset.apptId;
            completeVisitModal.showModal();
        }
        // Delete Owner
        if (e.target.matches('.action-button.delete-owner')) {
            const ownerId = e.target.dataset.ownerId;
            showGlobalMessage('Deleting owner and all associated data...', 'success', 0); // No auto-hide
            showLoading();
            const response = await fetch(`${API_BASE_URL}/owners/${ownerId}`, { method: 'DELETE' });
            hideLoading();
            if (response.ok) {
                showGlobalMessage('Owner deleted successfully!', 'success');
                const ownerId = document.querySelector('#owner-table tr.selected')?.dataset.ownerId;
                const ownerTableBody = document.querySelector('#owner-table tbody');
                if (ownerTableBody) {
                    document.querySelectorAll('#owner-table tbody tr').forEach(row => {
                        if (row.dataset.ownerId == ownerId) {
                            row.remove();
                        }
                    });
                }
                fetchAndRenderOwners();
            } else {
                const err = await response.json().catch(() => ({}));
                showGlobalMessage(err.message || 'Failed to delete owner.', 'error');
            }
        }
        // Delete Pet
        if (e.target.matches('.action-button.delete-pet')) {
            const petId = e.target.dataset.petId;
            showGlobalMessage('Deleting pet...', 'success', 0); // No auto-hide
            showLoading();
            const response = await fetch(`${API_BASE_URL}/pets/${petId}`, { method: 'DELETE' });
            hideLoading();
            if (response.ok) {
                showGlobalMessage('Pet deleted successfully!', 'success');
                const ownerId = document.querySelector('#owner-table tr.selected')?.dataset.ownerId;
                if (ownerId) showPetsForOwner(ownerId, document.getElementById('selected-owner-name').textContent);
            } else {
                const err = await response.json().catch(() => ({}));
                showGlobalMessage(err.message || 'Failed to delete pet.', 'error');
            }
        }
        // Edit Owner
        if (e.target.matches('.action-button.edit-owner')) {
            const ownerId = e.target.dataset.ownerId;
            const row = e.target.closest('tr');
            const phone = row.querySelector('td:nth-child(2)').textContent;
            
            document.getElementById('edit-owner-id').value = ownerId;
            document.getElementById('edit-owner-phone').value = phone;
            document.getElementById('edit-owner-modal').showModal();
        }
        // Edit Pet
        if (e.target.matches('.action-button.edit-pet')) {
            const petId = e.target.dataset.petId;
            const row = e.target.closest('tr');
            const breed = row.querySelector('td:nth-child(3)').textContent;
            
            document.getElementById('edit-pet-id').value = petId;
            document.getElementById('edit-pet-breed').value = breed;
            document.getElementById('edit-pet-modal').showModal();
        }
        // Close any modal
        if (e.target.matches('.close-modal-btn')) {
            e.target.closest('dialog').close();
        }
    });
});