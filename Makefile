NAME=impanel-with-osk
DOMAIN=52hertz-reunion.site

.PHONY: all pack install clean

all: dist/extension.js dist/prefs.js dist/stylesheet.css data/gnome-shell-osk-layouts.gresource

node_modules: package.json
	bun install

dist/extension.js dist/prefs.js: node_modules
	bun run build

dist/stylesheet.css: src/stylesheet.css
	cp src/stylesheet.css dist/stylesheet.css

data/gnome-shell-osk-layouts.gresource: data/osk-layouts data/gnome-shell-osk-layouts.gresource.xml data/osk-layouts/us.json
	cd data && glib-compile-resources gnome-shell-osk-layouts.gresource.xml --sourcedir=osk-layouts --target=gnome-shell-osk-layouts.gresource

$(NAME)@$(DOMAIN).shell-extension.zip: dist/extension.js dist/prefs.js dist/stylesheet.css data/gnome-shell-osk-layouts.gresource
	@gnome-extensions pack --force --podir=../po --extra-source=../metadata.json --extra-source=../data/ --extra-source=../schemas/ ./dist

pack: $(NAME)@$(DOMAIN).shell-extension.zip

install: $(NAME)@$(DOMAIN).shell-extension.zip
	@gnome-extensions install --force $(NAME)@$(DOMAIN).shell-extension.zip

clean:
	@rm -rf dist node_modules data/gnome-shell-osk-layouts.gresource $(NAME)@$(DOMAIN).shell-extension.zip