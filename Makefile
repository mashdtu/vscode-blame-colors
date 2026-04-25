VSIX := $(shell node -p "const p=require('./package.json'); p.name+'-'+p.version+'.vsix'")

.PHONY: all compile watch package install clean

all: compile

compile:
	npm run compile

watch:
	npm run watch

package: compile
	vsce package

install: package
	code --install-extension $(VSIX)

clean:
	rm -rf out $(VSIX)
