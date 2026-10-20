Run the backend with:

python3 server.py

Then open http://localhost:3000 in your browser. Every expense you add, edit or delete is saved to expenses.db through the API at http://localhost:3000/api/expenses.

Weekly spending report in the terminal:

python3 server.py weekly --weeks 8
