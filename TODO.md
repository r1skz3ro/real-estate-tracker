# TODO

## Global:

- [x] Projects should be listed on the left side in the side menu.
- [x] On top of the list there should be a button to create new project.
- [x] There should be optioon to update project title and description.
- [x] Every project in a separate route and page (`/projects/$projectId`).

## App architecture and file structure:

- [x] Filesshould be scoped in folder with all the related data, tests, styles, types and other files.
- [x] There should be separation in files between logic and ui.
- [x] Backend part should be separated considering MVC patterns.
- [x] Id like each folder contain clear readme file with short and concise description of the folder and its content.

## Per link config and tracking:

- Each link should be a separate entity, with latest fethcing logs, separate listings, if it fails what it mens (like 404 error), possibility to edit a link. So it shuld be a separate instance. Link calls are executeed one by one thats why we have to treat it like a separate entity. Each link should have its own status, logs, and history.
- listings should be also scoped per link. I think now that each link should be a separate page with all the config, data, logs.
- option to refresh listings per link.
- initial fetch should list 10 last listings, so when link is added user is aware that it works. There should be information in that first section that this is initial fetch and shows only 10 listings.
- There should be optioon to update link.
- There should be logs for every link with status etc, they refresh when user click refresh and its filled with new logs. Api calls (if any), number of new listings (if any), progress, status of fetch.
- After link is added before first fetch it should verify it the link is valid and supported.
- There is missing time added of a listing.
- There should be tracked history of every fetch (how many new listings, how many removed, etc. what was the status of the fetch).

## Common listing

- There still should be common listing list, below links similar to what we haveright now.
- initial fetch should list 10 last listings per link, so when link is added user is aware that it works. There should be information in that first section that this is initial fetch and shows only 10 listings x number oif links.
- There should be some separate tab inside the project to list all stored ever links from db.

### Misc:

- The app should be hosted.
