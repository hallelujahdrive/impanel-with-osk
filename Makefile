NAME=fcitx-jp-osk
DOMAIN=52hertz-reunion.site

.PHONY: all pack install clean

all: dist/extension.js dist/prefs.js dist/stylesheet.css data/gnome-shell-osk-layouts.gresource schemas/gschemas.compiled

node_modules: package.json
	npm ci

dist/extension.js dist/prefs.js dist/stylesheet.css: node_modules
	npm run build

data/gnome-shell-osk-layouts.gresource: data/osk-layouts data/gnome-shell-osk-layouts.gresource.xml data/osk-layouts/us.json
	cd data && glib-compile-resources gnome-shell-osk-layouts.gresource.xml --sourcedir=osk-layouts --target=gnome-shell-osk-layouts.gresource

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.fcitx-jp-osk.gschema.xml
	glib-compile-schemas schemas/

$(NAME).zip: dist/extension.js dist/prefs.js dist/stylesheet.css data/gnome-shell-osk-layouts.gresource schemas/gschemas.compiled
	@(mkdir dist/data && cp -r data/gnome-shell-osk-layouts.gresource dist/data/)
	@(mkdir dist/schemas && cp schemas/gschemas.compiled dist/schemas/)
	@cp metadata.json dist/
	@(cd dist && zip ../$(NAME).zip -9r .)

pack: $(NAME).zip

install: $(NAME).zip
	@touch ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@rm -rf ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@mv dist ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)

clean:
	@rm -rf dist node_modules data/gnome-shell-osk-layouts.gresource schemas/gschemas.compiled $(NAME).zip