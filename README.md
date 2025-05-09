# CabbieViz

Course project for CS526.

## Deployment

1. Dependencies Prepare:

   The `env.yaml` file contains the package dependencies of the project. 

2. Database Prepare:

   Firstly, the databases are based on MySQL. 

   If you want to build a local MySQL server, please refer to

    [MySQL :: MySQL 9.3 Reference Manual :: 2 Installing MySQL](https://dev.mysql.com/doc/refman/9.3/en/installing.html) for setting up a MySQL server.

   Two warnings for creating MySQL server:

   ​	1) Please create a database named `your_database` for importing data.

   ​	2) Please **do not** set up the administration name using `admin` if you are going to import data using `diva_dump.sql`.

   

3. Data Import:

   You may import data using one of the following ways:

   a) Then the databases can be constructed using the `diva_dump.sql` by 

   ```
   mysql -u your_username -h your_host -D your_database -p < diva_dump.sql
   ```

   And then input your password to continue to import data;

   b) Open the `data_import.py` and change the variables in the python script to your attributes (It will take some time to import data in this way):

   ```
   db_username, db_password, db_host, db_port, db_database
   ```

4. Run the application:

   Make sure you are under the folder `CabbieViz`, then change the variable `port` in the `run.py` to `your_port`. And then run the `run.py` script under the folder `CabbieViz`

   Then you can access the project by `localhost:your_port`





## File Structure

```
├─app
│  ├─models 		-- Data model defined for SQLAlchemy.
│  ├─routes			-- Blueprint Routes for flask backend.
│  ├─static			-- Static files for frontend including .js and .css.
│  │  ├─css
│  │  └─js
│  │      └─data	-- Static data for frontend.
│  └─templates		-- HTML files for frontend.
└─data				-- Dynamic data stored in database and used for frontend 						request.
```

