# Preprocessing Pipeline

Before the recommendation engine starts, preprocess all datasets.

Create the following derived tables.

1. Product Lookup Table

Derived from

product_catalogue.csv

Contains

- Product ID
- Name
- Description
- Category
- Target Segment
- Price
- Dependencies
- Related Products

------------------------------------

2. Bundle Intelligence Table

Derived from

smb_leads.csv

Contains

- Bundle
- Frequency
- Acceptance Rate
- Activation Rate
- Average NPS
- Average Churn
- Median Accepted Quote
- Average Contract Length

------------------------------------

3. Product Conversion Table

Derived from

smb_leads.csv

Contains

- Product
- Interested Count
- Bought Count
- Conversion Rate
- Common Drop Reasons

------------------------------------

4. Customer Embeddings

Derived from

smb_leads.csv

Used for

Similarity Search

------------------------------------

5. Dependency Graph

Derived from

product_catalogue.csv

Used for

Dependency Resolution