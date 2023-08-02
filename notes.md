# General notes

## Redis structure

- Items:
    - items --> SORTED SET (<sort1>, "<id1>"), (<sort2>, "<id2>"), ...
	- items:<id>:title --> STRING "<title>"
	- items:<id>:tags --> SET "<tag1>", "<tag2>", ...
- Tags:
    - tags --> SET "<tag1>", "<tag2>", ...


## ToDos/Ideas

- Add submit functionality to edit cards
- Implement tag coloring
+ Load autocomplete tags from backend
- Implement labels for API keys?
+ Move js to file
- Refactor frontend to Elm