# AI-Vibex
CAMPUSBITE - CANTEEN QUEUE & PRE-ORDER SYSTEM
=============================================

ABOUT
-----
CampusBite is a web application that lets students and staff pre-order food
from the college canteen, choose a pickup time slot, pay (mock payment) and
track their order live. The kitchen manages incoming orders on a dashboard,
and the admin controls the menu, stock, prices and slot capacity.

The problem it solves: long canteen queues and an unevenly loaded kitchen.
Smart slot allocation spreads orders across 10-minute pickup slots based on
how much preparation work the kitchen can handle.


TECH STACK
----------
Backend   : Python 3, Flask
Database  : SQLite (created automatically)
Frontend  : HTML, CSS, JavaScript (Jinja2 templates)
Auth      : Werkzeug password hashing, Flask sessions


MODULES
-------
1.  User Authentication   - Student and staff login, signup, role-based access
2.  Food Menu Management  - Menu display with prices, prep time and stock
3.  Food Ordering         - Add items to cart and place orders
4.  Pre-Order Management  - Order in advance and choose a pickup time
5.  Smart Slot Allocation - 10-minute slots filled by kitchen workload
6.  Queue Management      - Public live board of current orders
7.  Kitchen Dashboard     - View and update incoming orders
8.  Live Order Tracking   - Pending, Preparing, Ready, Collected progress
9.  Payment Management    - Mock payment (UPI, Card, Cash)
10. Inventory Management  - Stock reduces on each order, sold-out is automatic
11. Admin Dashboard       - Manage menu, prices, stock, slot capacity, sales


PROJECT STRUCTURE
-----------------
canteen/
|-- app.py               Flask backend (all modules)
|-- requirements.txt     Python dependencies
|-- README.md            This file
|-- canteen.db           Created automatically on first run
|-- static/
|   |-- style.css        All styling (light and dark mode)
|-- templates/
    |-- base.html        Common layout and navigation
    |-- home.html        Landing page
    |-- login.html       Login and signup
    |-- menu.html        Menu, cart, slot selection, payment
    |-- track.html       Customer order tracking
    |-- queue.html       Public queue board
    |-- kitchen.html     Kitchen dashboard
    |-- admin.html       Admin dashboard


CODE MAP (MODULE -> FILE)
-------------------------
Module               Backend (app.py)                    Frontend
1  Authentication    login, register, logout             login.html
2  Menu              menu()                              menu.html, home.html
3  Ordering          place_order()                       menu.html (cart)
4  Pre-order         slot chosen in place_order()        menu.html (slot chips)
5  Smart slots       slot_list(), /api/slots             menu.html
6  Queue             queue(), /api/queue                 queue.html
7  Kitchen           kitchen(), /api/kitchen,            kitchen.html
                     set_status()
8  Live tracking     track(), /api/my                    track.html
9  Payment           method and paid in place_order()    menu.html
10 Inventory         stock update in place_order(),      admin.html
                     edits in admin()
11 Admin             admin()                             admin.html


HOW TO RUN
----------
Requirements: Python 3.9 or newer.

1. Open a terminal in the project folder.
2. Install Flask:
       pip install flask
3. Start the server:
       python app.py
4. Open this address in your browser:
       http://127.0.0.1:5000

The database and sample data are created automatically on first run.
To reset everything, stop the server, delete canteen.db and run again.


DEMO LOGINS
-----------
Role      Email            Password
Student   student@c.com    student
Staff     staff@c.com      staff
Kitchen   kitchen@c.com    kitchen
Admin     admin@c.com      admin


HOW IT WORKS
------------
Customer flow:
1. Sign in and open the menu.
2. Add items to the cart.
3. Pick an available pickup slot (the lightning symbol marks the earliest).
4. Choose a payment method and place the order.
5. Get a token number and track the order on My Orders.

Kitchen flow:
1. Sign in as kitchen.
2. Press Start cooking, then Mark ready, then Handed over.
3. Customers see each status change within about 5 seconds.

Admin flow:
1. Sign in as admin.
2. Edit prices, stock and prep time, hide or add items.
3. Change slot capacity and view today's orders and sales.


SMART SLOT ALLOCATION
---------------------
- Pickup slots are 10 minutes long, starting from the next 10-minute mark.
- Every item has a prep time (in minutes).
- Each slot has a capacity (default 20 prep-minutes, editable by admin).
- The load of an order is the sum of (prep time x quantity) of its items.
- A slot is offered only if its remaining capacity covers the order's load.
- Full slots are struck out, which spreads orders across the kitchen's time.
- An order larger than one slot's capacity may use a completely empty slot.


TROUBLESHOOTING
---------------
TemplateNotFound  : The templates folder must be named "templates" and sit
                    next to app.py. Static files go in a folder named "static".
no such table     : Delete canteen.db and restart so the tables are recreated.
NameError: DB     : Check that app.py defines DB (not DDB) near the top.
Slots all struck  : Increase slot capacity on the Admin page, or place a
out               : smaller order.
Page not opening  : Open the address in a browser, not in the terminal, and
                    make sure python app.py is still running.


FUTURE IMPROVEMENTS
-------------------
- Real payment gateway (Razorpay or UPI)
- SMS or push notification when the order is ready
- Sales charts and reports for the admin
- Order cancellation and refunds
- Splitting the backend into one file per module (Flask Blueprints)
- Deployment on a college server or cloud platform
