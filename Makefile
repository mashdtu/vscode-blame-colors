DIST    := dist
VSIX    := $(DIST)/$(shell node -p "const p=require('./package.json'); p.name+'-'+p.version+'.vsix'")
VERSION := $(shell node -p "require('./package.json').version")

.PHONY: all compile watch package install release bump-minor bump-major clean

all: compile

compile:
	npm run compile

watch:
	npm run watch

package: compile
	mkdir -p $(DIST)
	vsce package --out $(DIST)/

install: package
	code --install-extension $(VSIX)

clean:
	rm -rf out $(DIST)

bump-minor:
	@node -e "\
	  const fs=require('fs'), p=JSON.parse(fs.readFileSync('package.json','utf8'));\
	  const [a,b]=p.version.split('.').map(Number);\
	  p.version=a+'.'+(b+1)+'.0';\
	  fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');\
	  console.log('Bumped to '+p.version);"

bump-major:
	@node -e "\
	  const fs=require('fs'), p=JSON.parse(fs.readFileSync('package.json','utf8'));\
	  const [a]=p.version.split('.').map(Number);\
	  p.version=(a+1)+'.0.0';\
	  fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');\
	  console.log('Bumped to '+p.version);"

release: compile
	@CURRENT=$$(node -p "require('./package.json').version"); \
	 printf "Current version: $$CURRENT\nNew version: "; read NEW_VERSION; \
	 if [ -z "$$NEW_VERSION" ]; then echo "Aborted: no version given."; exit 1; fi; \
	 node -e "\
	   const fs=require('fs'), p=JSON.parse(fs.readFileSync('package.json','utf8'));\
	   p.version='$$NEW_VERSION';\
	   fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');\
	   console.log('Set version to '+p.version);"; \
	 mkdir -p $(DIST); \
	 VSIX="$(DIST)/$$(node -p "const p=require('./package.json'); p.name+'-'+p.version+'.vsix'")"; \
	 vsce package --out $(DIST)/ && \
	 if [ -n "$$(git status --porcelain)" ]; then git add -A && git commit -m "chore: release v$$NEW_VERSION"; fi && \
	 (git tag "v$$NEW_VERSION" 2>/dev/null || echo "Tag v$$NEW_VERSION already exists, skipping.") && \
	 (git push origin "v$$NEW_VERSION" 2>/dev/null || echo "Tag already on remote, skipping push.") && \
	 gh release create "v$$NEW_VERSION" "$$VSIX" --title "Release v$$NEW_VERSION" \
	   $$([ -f RELEASE_NOTES.md ] && echo "--notes-file RELEASE_NOTES.md" || echo "--notes \"Release v$$NEW_VERSION\"")
