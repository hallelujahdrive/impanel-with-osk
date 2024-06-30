NAME=impanel-with-osk
DOMAIN=52hertz-reunion.site

.PHONY: all pack install clean

all: dist/extension.js dist/prefs.js dist/stylesheet.css data/gnome-shell-osk-layouts.gresource schemas/gschemas.compiled

node_modules: package.json
	npm ci

dist/extension.js dist/prefs.js dist/stylesheet.css: node_modules
	npm run build

data/gnome-shell-osk-layouts.gresource: data/osk-layouts data/gnome-shell-osk-layouts.gresource.xml data/osk-layouts/us.json
	cd data && glib-compile-resources gnome-shell-osk-layouts.gresource.xml --sourcedir=osk-layouts --target=gnome-shell-osk-layouts.gresource

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.impanel-with-osk.gschema.xml
	glib-compile-schemas schemas/

$(NAME)@$(DOMAIN).shell-extension.zip: dist/extension.js dist/prefs.js dist/stylesheet.css data/gnome-shell-osk-layouts.gresource schemas/gschemas.compiled
	@gnome-extensions pack --force --podir=../po --extra-source=../metadata.json --extra-source=../data/ --extra-source=../schemas/ ./dist

pack: $(NAME)@$(DOMAIN).shell-extension.zip

install: $(NAME)@$(DOMAIN).shell-extension.zip
	@gnome-extensions install --force $(NAME)@$(DOMAIN).shell-extension.zip

clean:
	@rm -rf dist node_modules data/gnome-shell-osk-layouts.gresource schemas/gschemas.compiled $(NAME)@$(DOMAIN).shell-extension.zip