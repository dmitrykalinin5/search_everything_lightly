# Graph Report - search_everything_lightly  (2026-09-10)

## Corpus Check
- 23 files · ~70,233 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 258 nodes · 327 edges · 41 communities (29 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `40aef972`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]

## God Nodes (most connected - your core abstractions)
1. `Search Everything Lightly — техническое задание` - 49 edges
2. `SearchOverlay` - 15 edges
3. `Search Everything Lightly` - 11 edges
4. `run()` - 8 edges
5. `19. Настройки — версия 0.2+` - 8 edges
6. `hasWildcards()` - 7 edges
7. `rankResults()` - 7 edges
8. `SearchEngine` - 7 edges
9. `openPath()` - 7 edges
10. `25. Ответственность модулей` - 7 edges

## Surprising Connections (you probably didn't know these)
- `test()` --calls--> `run()`  [INFERRED]
  tests/integration.js → tests/shellSmoke.js
- `rankResults()` --calls--> `queryTerms()`  [EXTRACTED]
  src/ranking.js → src/query.js
- `rankResults()` --calls--> `hasWildcards()`  [EXTRACTED]
  src/ranking.js → src/query.js
- `findApplications()` --calls--> `hasWildcards()`  [EXTRACTED]
  src/applicationItem.js → src/query.js

## Communities (41 total, 12 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (16): SearchEverythingLightly, ApplicationItem, findApplications(), abbreviatePath(), buildArguments(), displayText(), hasWildcards(), queryState() (+8 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (23): 12. Работа с процессами, 14. Обновление индекса, 16. Reveal in Files, 17. Иконки, 1. Общая информация, 23. История поиска — версия 0.4+, 27. Требования к `enable()` / `disable()`, 29. Обработка ошибок (+15 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (26): code:bash (sudo dnf install plocate gettext make python3 glib2), code:bash (make build), code:bash (make disable), code:bash (journalctl --user -f -o cat /usr/bin/gnome-shell), code:bash (make enable), code:bash (gnome-extensions install --force dist/search_everything_ligh), code:bash (gnome-extensions disable search-everything-lightly@ogultra), code:bash (sudo updatedb) (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (14): checkFile(), launch(), openPath(), reveal(), assert(), broken, done, engine (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (13): 19.1. Горячая клавиша, 19.2. Максимум результатов, 19.3. Минимальная длина запроса, 19.4. Системные файлы, 19.5. Скрытые файлы, 19.6. Исключенные директории, 19. Настройки — версия 0.2+, code:text (prefs.js) (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (8): description, gettext-domain, name, settings-schema, shell-version, uuid, version, version-name

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (9): 8.1. Окно, 8.2. Поле поиска, 8.3. Результат поиска, 8.4. Выбранный результат, 8.5. Поведение клавиш, 8. UI / UX, code:text (600–800 px), code:text ([icon] filename.ext) (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (9): 9.1. MVP, 9.2. Минимальная длина запроса, 9.3. Ограничение результатов, 9. Поисковый движок, code:text (200–500), code:text (plocate), code:bash (plocate --ignore-case --existing --limit 200 -- "query"), code:text (3) (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.5
Nodes (7): assert(), delay(), hotkey(), key(), run(), screenshot(), until()

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): name, private, scripts, test, type, version

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (7): 25. Ответственность модулей, `extension.js`, `prefs.js`, `ranking.js`, `resultItem.js`, `searchEngine.js`, `searchOverlay.js`

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (7): 45. Roadmap, v0.1 — MVP, v0.2 — usability, v0.3 — advanced search, v0.4 — GNOME integration, v0.5 — polish, v1.0

### Community 13 - "Community 13"
Cohesion: 0.33
Nodes (6): 43. Тестирование, Keyboard, Scaling, Мониторы, Открытие, Поиск

### Community 15 - "Community 15"
Cohesion: 0.5
Nodes (4): 13. Проверка зависимостей, code:bash (plocate), code:text (plocate is not installed.), code:text (sudo dnf install plocate)

### Community 16 - "Community 16"
Cohesion: 0.67
Nodes (3): 15. Открытие файлов, code:text (Enter → открыть URI / файл приложением по умолчанию), code:text (Enter → открыть директорию в стандартном файловом менеджере)

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (3): 28. Требования к производительности, code:text (< 100 ms), code:text (желательно < 200 ms)

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (3): 3.1. Основная цель, 3.2. Дополнительные цели, 3. Цели проекта

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (3): 40. Установка для разработки, code:bash (git clone ...), code:text (~/.local/share/gnome-shell/extensions/<UUID>/)

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (3): 6. Основной пользовательский сценарий, code:text (Super + Space), code:text (┌──────────────────────────────────────────────┐)

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (3): 10. Ранжирование, code:text (lab3), code:text (~/Documents/lab3.pdf)

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (3): 11. Дебаунс, code:text (50–150 ms), code:text (100 ms)

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (3): 18. Сокращение путей, code:text (/home/username/Documents/file.pdf), code:text (~/Documents/file.pdf)

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (3): 21. Fuzzy matching — версия 0.3+, code:text (phyrep), code:text (physics_report.pdf)

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (3): 35. Анимации, code:text (fade + scale), code:text (100–200 ms)

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (3): 20. Фильтры — версия 0.3+, code:text (ext:pdf report), code:text (type:file)

## Knowledge Gaps
- **129 isolated node(s):** `uuid`, `name`, `description`, `shell-version`, `version` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Search Everything Lightly — техническое задание` connect `Community 1` to `Community 4`, `Community 7`, `Community 8`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 28`, `Community 29`, `Community 30`, `Community 31`, `Community 32`, `Community 33`, `Community 34`, `Community 35`?**
  _High betweenness centrality (0.235) - this node is a cross-community bridge._
- **Why does `19. Настройки — версия 0.2+` connect `Community 4` to `Community 1`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `8. UI / UX` connect `Community 7` to `Community 1`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `uuid`, `name`, `description` to the rest of the system?**
  _129 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._