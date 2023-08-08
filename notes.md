# General notes

## Redis structure

- Items:
    - items --> SORTED SET (<sort1>, "<id1>"), (<sort2>, "<id2>"), ...
	- items:<id>:title --> STRING "<title>"
	- items:<id>:tags --> SET "<tag1>", "<tag2>", ...
- Tags:
    - tags --> SET "<tag1>", "<tag2>", ...


## ToDos/Ideas

+ Add submit functionality to edit cards
- Implement tag coloring
+ Load autocomplete tags from backend
- Implement labels for API keys?
+ Move js to file
- Refactor frontend to Elm
+ Remove scroll on vertical overflow of card-content
+ Bug: Autocomplete broken on second tag
+ Add UI to initiate editing items
+ Add UI to edit items
+ Add UI to delete items
+ Refactor item/tags reloading to be purely from backend --> Implement "Reload" function
+ Add "done" to item data & sync
+ Push-Sync "done" status
+ Bug: Page jumps to top upon button clicks
- Implement "Delete all done items"
- Add eternal set of titles for autocomplete
+ Refactor api key authentication to central route
- Add tag filtering (sticky input on top/navbar)
