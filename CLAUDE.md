# Shadowbot

Shadowbot is a project to plan routing, identify locations of interest and investigate telematics data.

## Repository layout

Frontend and backend are isolated into sibling top-level folders, each independently installable:

```bash
frontend/   # NextJS app — see Frontend section below (paths there are relative to frontend/)
backend/    # Python package (uv/pip-installable)
```

## Python backend

### Tech Stack

* FastAPI
* Pydantic>2
* pydantic-settings (nested config via `__` env delimiter, `.env` file — see `backend/.env.example`)
* Postgres (if necessary)
* loguru
* UV
* either Vercel AI SDK for Python (ai) or pydantic-ai


### Design Principles / Preferences

* Everything is typed
* Pydantic first particularly where validation is required
  * datetime fields should start with date_
  * use default= instead of something implicit like None
  * use str over UUID types for IDs
* the majority of time prefer keyword arguments in function use, ie. func(arg=1) instead of func(1)
* Google doc strings
* minimal comments (prefer well named variables and functions)
* python 3.12 syntax to lowercase list, use | instead of Optional, etc.
* consistent terminology between schemas, mappings, etc. with the frontend where appropriate besides casing
* if you need to test a new feature, use fake data always create a new feature and name appropriately
* keep code brief

## Frontend 

This a NextJS app.

### Workspace layout

```bash
app/  # NextJS app layout with pages
components/  # Core components used across the app
features/    # feature based layout where everything aligns with a specific view or schema (commonly aligns with core package schema)
  <feature>/     # Feature (ie. example of a feature)
    components/    # Feature specific components
    hooks/ # Wraps React Query logic 
    api.ts     # fetching logic / endpoint from the backend
    types.ts   # Feature specific types that again match to core schemas 
hooks/      # common hooks
lib/        # common utils and api client logic for axios
provider/   # common providers at the app level
types/      # common schemas
```


### Tech Stack

* NextJS / React (BaseUI)
* React Query
* ShadCN
* TailwindCSS v4
* AI SDK
* Typescript
* Zod
* TanStack Virtual (especially for tables)

### Design Principles / Preferences

* prefer client-side fetching and management
* useEffect is anti-pattern
* prefer typescript objects that align with pydantic schemas (but camelCase), rather than many pieces of useState, especially for things like filters
* use react doctor to make code performant
* keep most data out of the URL unless its an ID specific page
* Annotation should always be a feature
* consistent terminology with the backend where appropriate with the exception of casing per above
* support both paginated and infinite scroll for most things