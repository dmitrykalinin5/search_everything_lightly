UUID := search_everything_lightly@dmitrykalinin5.github.com
DOMAIN := search-everything-lightly
DATA_HOME := $(if $(XDG_DATA_HOME),$(XDG_DATA_HOME),$(HOME)/.local/share)
EXTENSION_DIR := $(DATA_HOME)/gnome-shell/extensions/$(UUID)

.PHONY: all build install uninstall enable disable prefs pack lint test
all: pack

build:
	python3 scripts/build.py

install: build
	install -d "$(EXTENSION_DIR)"
	cp -r build/$(UUID)/. "$(EXTENSION_DIR)/"
	@printf 'Installed %s. Log out and back in on Wayland, then run make enable.\n' '$(UUID)'

uninstall:
	-gnome-extensions disable $(UUID)
	gnome-extensions uninstall $(UUID)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

prefs:
	gnome-extensions prefs $(UUID)

pack: build
	@printf 'Bundle: dist/%s.shell-extension.zip\n' '$(UUID)'

lint:
	python3 scripts/check.py

test: lint
	node --test tests/query.test.js tests/ranking.test.js
	python3 tests/run_integration.py
