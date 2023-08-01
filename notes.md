# General notes

## Redis structure

- Items:
    - items --> SORTED SET (<sort1>, "<id1>"), (<sort2>, "<id2>"), ...
	- items:<id>:title --> STRING "<title>"
	- items:<id>:tags --> SET "<tag1>", "<tag2>", ...
- Tags:
    - tags --> SET "<tag1>", "<tag2>", ...