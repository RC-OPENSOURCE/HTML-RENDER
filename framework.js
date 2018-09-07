class Subscriptions {
    constructor() {
        this.subscriptions = {};
        this.subscribers = [];
    }
    static getMainSubscription() {
        return this.mainSubscription;
    }
    subscribe(method, objectPath = []) { 
        if (objectPath.length == 0) {
            this.subscribers.push(method);
            return this;
        } else {
            let path = objectPath[0];
            objectPath.splice(0, 1);
            if (!this.subscriptions[path]) {
                this.subscriptions[path] = new Subscriptions();
            }
            return this.subscriptions[path].subscribe(method, objectPath);
        }
    }

    unsubscribe(method, objectPath = []) {
        if (objectPath.length == 0) {
            this.subscribers.splice(this.subscribers.indexOf(method), 1);
            return this;
        } else {
            let path = objectPath[0];
            objectPath.splice(0, 1);
            if (this.subscriptions[path]) {
                this.subscriptions[path].unsubscribe(method, objectPath);
            }
            return;
        }
    }
    notifySubscribers() {
        for (let subscriber of this.subscribers) {
            subscriber.changed();
        }
        for (let subscription in this.subscriptions) {
            this.subscriptions[subscription].notifySubscribers();
        }
    }
    notify(pathElements) {
        if (pathElements.length > 0) {
            let path = pathElements[0];
            pathElements.splice(0, 1);
            if (this.subscriptions[path]) {
                this.subscriptions[path].notify(pathElements);
            }
        } else {
            this.notifySubscribers();
        }
    }
}
Subscriptions.mainSubscription = new Subscriptions()
var mainSubscription = Subscriptions.getMainSubscription()

function notify(path) {
    mainSubscription.notify(path.split('.'));
}

function subscribe(path, method) {
    return mainSubscription.subscribe(method, path.split('.'));
}

function unsubscribe(path, method) {
    mainSubscription.unsubscribe(method, path.split('.'));
}
class BrowserElementSubscription {
    constructor(attribute, browserElement, subscription) {
        this.attribute = attribute;
        this.browserElement = browserElement;
        this.subscription = subscribe(subscription, this);
    }
    changed() {
        this.attribute.renderAttribute(this.browserElement, {tag:this.browserElement.tag});
    }
    destroy() {
        this.subscription.unsubscribe(this);
    }
}
class TagParameterSubscription {
    constructor(tag, path, expression, subscription) {
        this.tag = tag
        this.path = path
        this.expression = expression
        this.subscription = subscribe(subscription, this)
        let code = '( function(tag,result) { tag.' + path + ' = result; } )';
        this.set = eval(code)
    }
    changed() {
        var tag = this.tag
        var result = this.expression.callWithTagAndElement(tag.parentTag, tag)
        this.set(tag, result)
    }
    destroy() {
        this.subscription.unsubscribe(this);
    }
}
class BrowserElement {
    constructor(node) {
        this.node = node;
        this.init();
    }
    init() {
        this.children = [];
        this.subscriptions = [];
        this.tagSubscriptions = [];
        this.modelElement = null;
    }
    reset() {
        this.destroy(false);
        this.init();
    }
    bind(attribute, subscriptionStr = null) {
        if (subscriptionStr !== null) {
            let subscription = new BrowserElementSubscription(attribute, this, subscriptionStr);
            this.subscriptions.push(subscription);
        } else {
            if (this.boundAttributes == null) {
                this.boundAttributes = [];
            }
            this.boundAttributes.push(attribute);
        }
    }
    update(options) {
        if (this.modelElement !== null) {
            this.modelElement.update(this, options);
        }
    }
    static replaceElement(el, withEl) {
        el.parentNode.insertBefore(withEl, el);
        el.remove();
    }
    replaceElement(withEl) {
        if (this.node.parentNode) {
            this.node.parentNode.insertBefore(withEl, this.node.nextSibling)
        }
        this.node.remove()
        this.node = withEl
    }
    render(options) {
        this.modelElement.render(options, this);
    }
    removeNode() {
        if (this.node) {
            this.node.remove();
        }
        this.node = null;
    }
    destroySubitems() {
        if (this.children != null) {
            for (let child of this.children) {
                child.destroy(false);
            }
        }
        this.children = [];
    }
    destroy(withNode = true) {
        
        this.destroySubitems();
        if (withNode && this.node) {
            this.node.remove();
            this.node = undefined;
        }
        if (this.subscriptions && this.subscriptions.length > 0) {
            debugger
            for (let subscription of this.subscriptions) {
                subscription.destroy();
            }
        }
        if (this.tagSubscriptions && this.tagSubscriptions.length > 0) {
            debugger
            for (let tagSubscription of this.tagSubscriptions) {
                tagSubscription.tag.unsubscribe(tagSubscription.name, this)
            }
        }
        this.tagSubscriptions = undefined;
        this.subscriptions = undefined;
        if (this.boundAttributes != null && this.boundAttributes.length > 0) {
            debugger
            for (let boundAttribute of this.boundAttributes) {
                boundAttribute.unsubscribe(this);
            }
        }
            
        if (this.ownsTag !== undefined) {
            this.ownsTag.destroy(); // ownsTag destroy the tag (include tag)
            // here is a bug for the include tag (gets destroyed)
        }
    }
    replaceBrowserElement() {

    }
    unplace(comment = '') {
        if (this.node !== null && this.node.nodeType !== 8) {
            this.place(document.createComment(comment ? comment : 'placeholder (unplaced):'))
            this.destroySubitems()
        }
    }
    place(newNode) {
        if (newNode !== null) {
            this.replaceElement(newNode);
        } else {
            this.unplace();
        }
    }
}
var count = 0;
class ModelElement {
    constructor() {
        this.attributes = [];
        this.children = [];
        this.tagModel = null;
    }
    parseAttributes(node, options) {
        let attribs = node.attributes;

        if (attribs !== undefined) {
            for (var i = 0; i < attribs.length; i++) {
                let attrib = attribs[i];
                //if (!Attribute.attributeTypeNames.some( v => v == attrib.name)) continue;
                if (node.nodeName == 'LABEL' && attrib.name == 'for') continue;
                let attribute = Attribute.parseAttribute(this.modelNode, attrib.name, attrib.value, options);
                if (attribute !== null) {
                    this.attributes.push(attribute);
                }
            }
        }
        if (node.nodeType == 3 && node.nodeValue != null && Attribute.containsExpressions(node.nodeValue)) {
            this.attributes.push(new TextNodeAttribute("textnode", node.nodeValue, options));
        }
    }
    parseChildren(node, options) {
        if (node.hasChildNodes()) {
            let childNodes = Array.from(node.childNodes);
            for (let childNode of childNodes) {
                let childModelElement = null;

                let idx = 0;
                if (this.attributes.length == 0) {
                    idx = this.children.length + (options.childIdx !== undefined ? options.childIdx : 0)
                } else {
                    idx = this.children.length;
                }

                if (childNode.nodeType === 3) {
                    let trimmed = childNode.nodeValue.trim();
                    if (trimmed) {
                        if (Attribute.containsExpressions(trimmed)) {
                            if (node.nodeName == 'TEXTAREA') {
                                this.attributes.push(new TextareaNodeAttribute("textareanode", childNode.nodeValue, options))
                            } else {
                                childModelElement = new ModelElement(); //it shouldn't parse this
                                childModelElement.modelNode = document.createTextNode('');
                                childModelElement.attributes.push(new TextNodeAttribute("textnode", childNode.nodeValue, options));
                            }
                        } else {
                            this.modelNode.appendChild(childNode);
                            childModelElement = null;
                        }
                    }

                } else if (childNode.nodeType === 1) {
                    childModelElement = new ModelElement();
                    childModelElement.parse(childNode, Object.assign({}, options, { childIdx: idx }));

                    if (childModelElement.tagModel !== null) { } else if (childModelElement.attributes != null && childModelElement.attributes.length > 0) { } else if (childModelElement.children != null && childModelElement.children.length > 0) {
                        this.modelNode.appendChild(childModelElement.modelNode);
                        for (let child of childModelElement.children) {
                            this.children.push(child);
                        }
                        childModelElement = null;
                    } else {
                        if (childModelElement.modelNode) {
                            this.modelNode.appendChild(childModelElement.modelNode);
                        } else { }
                        childModelElement = null;
                    }
                }

                if (childModelElement !== null) {
                    let childElNode = document.createElement('child');
                    childElNode.setAttribute('i', idx);
                    this.modelNode.appendChild(childElNode);

                    this.children.push(childModelElement);
                }
            }
        }
    }
    subscribeAttributes(browserElement, options) {
        for (let attribute of this.attributes) {
            attribute.subscribe(browserElement, options);
        }
    }
    renderAttributes(browserElement, options) {
        for (let attribute of this.attributes) {
            if (options.render !== false) {
                attribute.renderAttribute(browserElement, options);
            }
        }
    }
    renderChildren(browserElement, options) { //should also render children when it has no node..
        if (options.render !== false && options.renderChildren !== false) {
            if (browserElement.node && browserElement.node.nodeType == 1) {
                if (this.children.length > 0) {
                    const childElements = Array.from(browserElement.node.getElementsByTagName('child'));
                    for (let i = childElements.length - 1; i >= 0; i--) {
                        let childElement = childElements[i];
                        let childBrowserEl = this.children[childElement.getAttribute('i')].render(Object.assign({}, options), null);
                        browserElement.children.push(childBrowserEl);
                        if (childBrowserEl != null && childBrowserEl.node != null) {
                            BrowserElement.replaceElement(childElement, childBrowserEl.node);
                        } else {
                            childElement.remove();
                        }
                    }
                }
            }
        }
    }
    parseAttributesAndExpressions(node, path, expressions, options) {
        let attrs = null
        let events = {}
        let tagReference = undefined

        if (node.nodeType == 3) {

        } else {
            let isArray = false;
            let isText = false;
            if (node.attributes !== undefined) {
                for (let attribute of node.attributes) {
                    let attributeName = attribute.nodeName;
                    let attributeValue = attribute.nodeValue;
                    if (attributeName === 'text') {
                        if (attrs == null) {
                            attrs = {}
                        }
                        isText = true
                        if (attributeValue) {
                            attrs[attributeValue] = node.innerHTML;
                        } else {
                            attrs = node.innerHTML;
                        }
                    } else if (attributeName === 'array') {
                        isArray = true
                    } else if (attributeName.startsWith('(')) {
                        let eventName = attributeName.substr(1, attributeName.length - 2)
                        // todo, do not subscribe to attribute options
                        events[eventName] = new Expression(attributeValue, Object.assign({}, options, { returnVoid: true, jscontext: true }));
                    } else if (attributeName == 'element') {
                        tagReference = attributeValue
                    } else {
                        if (attrs == null) {
                            attrs = {}
                        }
                        if (Attribute.containsExpressions(attributeValue)) {
                            let newPath = path.slice();
                            newPath.push(attributeName)
                            expressions.push({ path: newPath.join('.'), expression: new Expression(attribute.nodeValue, options) })
                            attrs[attributeName] = null
                        } else {
                            attrs[attributeName] = attributeValue
                        }
                    }
                }
            }
            if (!isText) {
                let iNode = 0;
                for (let child of node.childNodes) {
                    if (child.nodeType == 3) {
                        let nodeValue = child.nodeValue.trim();
                        if (nodeValue) {
                            if (Attribute.containsExpressions(nodeValue)) {
                                let expr = new Expression(nodeValue, options)
                                expressions.push({ path: path.join('.'), expression: expr })
                                attrs = null
                            } else {
                                attrs = nodeValue
                            }
                        }
                    } else {
                        let childPath;
                        if (isArray === true) {
                            childPath = path.slice();
                            childPath.push(node.nodeName.toLowerCase() + '[' + iNode + ']')
                        } else {
                            childPath = path;
                        }
                        let result = this.parseAttributesAndExpressions(child, childPath, expressions, options);
                        if (result.attributes) {
                            if (attrs == null) {
                                if (isArray === true) {
                                    attrs = []
                                } else {
                                    attrs = {}
                                }
                            }
                            if (isArray === true) {
                                attrs.push(result.attributes)
                            } else {
                                attrs[child.nodeName.toLowerCase()] = result.attributes;
                            }
                        }
                        iNode++;
                    }

                }
            }
        }
        return { attributes: attrs, expressions: expressions, events: events, tagReference: tagReference };
    }
    parseTag(node, options) {
        if (node && node.tagName !== undefined && Tag.isRegistered(node.tagName.toLowerCase())) {

            this.tagModel = new TagModel(node.tagName.toLowerCase());
            let result = this.parseAttributesAndExpressions(node, [], [], options);

            this.tagModel.attributes = result.attributes;
            this.tagModel.expressions = result.expressions;
            this.tagModel.events = result.events;
            this.tagModel.tagReference = result.tagReference;
            return true;
        }
        return (this.tagModel != null);
    }
    parse(node, options) {
        if (!this.parseTag(node, options)) {
            this.modelNode = node.cloneNode(false);
            this.parseAttributes(node, options);
            this.parseChildren(node, options);
        }
    }
    updateChildren(browserElement, options) {
        if (browserElement.children != null) {
            for (let browserElementChild of browserElement.children) {
                if (browserElementChild.node != null) {
                    browserElementChild.update(options);
                    if (browserElementChild.removed) {
                        browserElementChild.place();
                    }
                } else {
                    browserElementChild.render(options);
                }
            }
        }
    }
    update(browserElement, options) {
        let newOptions = Object.assign({}, options, { subscribe: false, tag: browserElement.tag });
        this.renderAttributes(browserElement, newOptions);
        this.updateChildren(browserElement, newOptions);
    }
    _renderChildren(options, browserElement) {
        let clonedNode = document.importNode(this.modelNode, true)
        browserElement = new BrowserElement(clonedNode)
        browserElement.tag = options ? options.tag : undefined
        if (options.forIdx) {
            browserElement.forIdx = Object.assign({}, browserElement.forIdx, options.forIdx)
        }
        browserElement.modelElement = this;
        this.renderChildren(browserElement, options)
        return browserElement;
    }
    render(options, browserElement) {
        if (this.tagModel !== null) {
            browserElement = this.tagModel.render({ tag: options.tag, forIdx: options.forIdx }, browserElement)
        } else {
            let newNode = this.modelNode ? document.importNode(this.modelNode, true) : null

            if (browserElement == null) {
                browserElement = new BrowserElement(newNode);
            } else {
                browserElement.place(newNode)
            }
        }
        if (browserElement) {
            browserElement.tag = options.tag;
            browserElement.forIdx = Object.assign({}, browserElement.forIdx, options.forIdx); // todo: set on model element, if forIdx is needed
            browserElement.modelElement = this;
            if (options.renderAttributes !== false) {
                this.subscribeAttributes(browserElement, options); // 	todo: only when render attributes
                this.renderAttributes(browserElement, options); // todo: process if before import of node
            }
            this.renderChildren(browserElement, options);
        }
        return browserElement;
    }
    destroy() {
        for (let attribute of this.attributes) {
            attribute.destroy();
        }
        this.attributes = null;
        for (let child of this.children) {
            child.destroy();
        }
        this.children = null;
    }
}
class TagModel {
    constructor(tagname) {
        this.expressions = [];
        this.attributes = {};
        this.tagName = tagname;
        this.classObj = null;
        this.modelElement = null;
    }
    static renderTag(tagname, attributes, browserElement = null, options = {}, events) {
        let tagModel = new TagModel(tagname)
        tagModel.attributes = attributes
        // let events = {}
        /*  for (let attributeKey in attributes) {
                  if (attributeKey.startsWith('(')) {
                      let attributeValue = attributes[attributeKey]
                      let eventName = attributeKey.substr(1, attributeKey.length - 2)
                      events[eventName] = new Expression(attributeValue, Object.assign({}, options, { returnVoid: true, jscontext: true }));
                      tagModel.attributes[attributeKey] = undefined
                  }
              } */
        tagModel.events = events
        return tagModel.render(options, browserElement)
    }
    renderTag(options, browserElement) {
        if (this.classObj === null) {
            this.classObj = Tag.getClass(this.tagName);
            this.defaults = Tag.getDefaults(this.tagName)
            if (this.classObj === null)
                return null;

            if (this.modelElement === null) {
                this.modelElement = Tag.getModelElement(this.tagName);
            }
        }

        let classObj = this.classObj;
        let tag = new classObj()
        tag.tagModel = this
        tag.parentTag = options.tag
        tag.forIdx = options.forIdx // is this needed?

        let attrs = {}
        Object.assign(attrs, this.defaults, this.attributes)
        for (let expressionParam of this.expressions) {
            let expression = expressionParam.expression;

            let result = expression.callWithTagAndElement(tag.parentTag, tag);
            if (result !== undefined) {
                if (expressionParam.path != '') {
                    eval('attrs.' + expressionParam.path + ' = result');
                } else {
                    console.warn('expressionParam.path is empty')
                }
            }
            for (let subscription of expression.subscriptions) {
                let tagParamSubscription = new TagParameterSubscription(tag, expressionParam.path, expression, subscription);
            }
        }

        if (tag.setup) {
            tag.setup()
        }
        Object.assign(tag, attrs)
        if (tag.init) {
            tag.init();
        }

        options.tag = tag;
        if (this.tagReference !== undefined) {
            tag.parentTag[this.tagReference] = tag;
        }
        if (this.modelElement === null) {
            let newBrowserElement = null
            if (tag.render) {
                newBrowserElement = tag.render(browserElement); // rename and make default function to only process node
            }
            if (newBrowserElement) {
                this.subscribeForParameterChanges(tag, options)
                newBrowserElement.ownsTag = tag
            }
            if (tag.ready) {
                tag.ready()
            }
            return newBrowserElement;
        }
        if (this.modelElement !== null) {
            let newBrowserElement = this.modelElement.render({ tag: tag }, browserElement);
            tag.render(newBrowserElement);
            this.subscribeForParameterChanges(tag, options);
            newBrowserElement.ownsTag = tag
            tag.ready()
            return newBrowserElement;
        }
    }
    subscribeForParameterChanges(tag, options) {
        for (let expressionParam of this.expressions) {
            let expression = expressionParam.expression;
            for (let subscription of expression.subscriptions) {
                subscribe(subscription, tag);
            }
            let tagSubscriptions = expression.getTagSubscriptions(options)
            for (let subscriptionName of tagSubscriptions) {
                if (tag.parentTag) {
                    tag.parentTag.subscribeTagAttribute(subscriptionName, expressionParam.path, tag, expression)
                } else {
                    console.warn('Tag parentTag is not defined',tag)
                }
            }
        }
    }
    unsubscribeForParameterChanges(tag) {
        for (let expressionParam of this.expressions) {
            let expression = expressionParam.expression;
            for (let subscription of expression.subscriptions) {
                unsubscribe(subscription, tag);
            }
            for (let subscriptionName in expression.tagSubscriptions) {
                let subscription = expression.tagSubscriptions[subscriptionName]
                if (tag.parentTag) {
                    tag.parentTag.unsubscribeTagAttribute(subscription, expressionParam.path, tag)
                } else {
                    console.warn('Tag parentTag is not defined',tag)
                }
            }
        }
    }
    render(options, browserElement) {
        if (Tag.isReady(this.tagName)) {
            return this.renderTag(options, browserElement);
        }
        if (browserElement == null) {
            let tempNode = document.createComment('downloading tag "' + this.tagName + '"')
            browserElement = new BrowserElement(tempNode);
        }
        Tag.ready(this.tagName).then((ready) => {
            let newBrowserEl = this.renderTag(options, browserElement); //can return undefined
        });
        return browserElement;
    }
}

class JJResourceObject {
    call(parameters) {
        return Tag.callJson(this.name, parameters)
    }
    action(action, parameters = null) {
        return JJResource.action(this.name, action, parameters)
    }
}
class JJResource {
    static loadDependencies(dependencies) {
        if (!dependencies) {
            return Promise.resolve(true)
        }
        let promises = []
        for (let dependency of dependencies) {
            let ready = true
            if (dependency.type == 'object' || dependency.type == 'dbtable' || dependency.type == 'validator') {
                ready = JJResource.registerAndLoad(dependency.name)
            } else if (dependency.type == 'tag') {
                if (!Tag.isRegistered(dependency.name)) {
                    ready = Tag.registerAndLoad(dependency.name)
                } else if (!Tag.isReady(dependency.name)) {
                    ready = Tag.ready(dependency.name)
                }
            }
            if (ready !== true) {
                promises.push(ready)
            }
        }
        if (promises.length === 1) {
            return promises[0]
        } else if (promises.length > 1) {
            return Promise.all(promises)
        } else {
            return Promise.resolve(true)
        }
    }
    static evalJavaScript(script, resource) {
      /*  let definitions = '';
        let dependencies = resource.dependencies
        if (dependencies && dependencies.length) {
            for (let dependency of dependencies) {
                let ready = true
                if (dependency.type == 'object') {
                    definitions+= "let " + dependency.name + " = JJResource.cls('"+dependency.name+"')\n" ;
                }
            }
        }
        if (definitions.length > 0) {
            console.log(definitions)
            eval(definitions);
        }*/
        return eval('(' + script + ')');
    }
    static loadedJson(name,json,resolvePromise) {
        Object.assign(JJResource.resources[name], json)
        JJResource.loadDependencies(json.dependencies).then(result => {
            let resource = JJResource.resources[name]
            if (resource.implementation) {
                if (resource.implementation.javascript != undefined && resource.implementation.javascript != '') {
                    try {
                        

                        resource.classObj = JJResource.evalJavaScript(resource.implementation.javascript, resource)
                        let classNames = JJResource.classRegex.exec(resource.implementation.javascript)
                        window[classNames[1]] = resource.classObj
                    } catch(error) {
                        console.error('Error in resource name:',name,error)
                    }
                }
            }
            resource.status = 'ready'
            let waitingResolved = false
            if (resource.classObj != undefined && resource.classObj.initialize != undefined) {
                
                let initializeResult = resource.classObj.initialize()
                if (typeof initializeResult === 'object') {
                    waitingResolved = true
                    initializeResult.then( initResult => {
                        JJResource.resolveWaiting(resource, resolvePromise)
                    })
                }  
            }
            if (!waitingResolved) {
                JJResource.resolveWaiting(resource, resolvePromise)
            }
            return true
        });
    }
    static registerAndLoad(name) {
        if (JJResource.resources[name] === undefined) {
            let resObj = new JJResourceObject()
            resObj.name = name
            resObj.status = 'downloading'
            resObj.onload = []
            let self = this
            //{ status: 'downloading', onload: [] }
            JJResource.resources[name] = resObj
            let url = '/resource/' + name + '.json'
            return new Promise(function (resolvePromise, reject) {
                let sessionItem = sessionStorage.getItem('resource_'+name)
                if (sessionItem) {
                    try {
                        JJResource.loadedJson(name,JSON.parse(sessionItem),resolvePromise)
                    } catch(error) {
                        console.error('Could not load tag ' + name, error)
                    }
                } else {

                    fetch(url, { credentials: "include" })
                        .then( result => result.text())
                        .then( result => {
                            sessionStorage.setItem('resource_'+name,result)
                            return JSON.parse(result)
                        })
                        .then(json => {
                            JJResource.loadedJson(name,json,resolvePromise)
                        }).catch(error => {
                            console.error("Could not include ", name, error)
                        })
                    }
            });
        }
        return Promise.resolve(JJResource.resources[name]) // should not return 2 different types
    }
    
    static resolveWaiting(resource,resolvePromise) {
        let onload = resource.onload
        for (let loadFn of onload) {
            loadFn(resource)
        }
        resolvePromise(resource) 
        return resource
    }
    static callWithJSON(postData) {
        return fetch("/api/call.php", {
            method: "POST",
            body: JSON.stringify(postData),
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        })
    }
    static callText(resource, action, parameters = null) {
        let postData = { "resource": resource, action: action, data: parameters ? parameters : null }
        return JJResource.callWithJSON(postData).then( res => res.text() ) // todo catch
    }
    static action(resource, action, parameters = null) {
        let postData = { "resource": resource, action: action, data: parameters ? parameters : null }
        return JJResource.callWithJSON(postData).then((res) => {
            return res.json();
        }).catch((error) => {
            console.error(resource, error)
        });
    }
    static create(name, params = {}) {
        let resource = JJResource.resources[name]
        let cls = resource.classObj
        if (cls === undefined) {
            return params // params
        }
        let newObj = new cls()
        Object.assign(newObj, resource.configuration, params)
        return newObj
    }
    static loaded(name) {
        let obj = JJResource.resources[name];
        if (obj) {
            if (obj.status == 'downloading') {
                return new Promise(function (resolve) {
                    obj.onload.push(resolve)
                });
            }
            return Promise.resolve(obj);
        } else {
            return JJResource.registerAndLoad(name)
        }
    }
    
    static getResource(name) {
        return JJResource.resources[name]
    }
    static cls(name) {
        return JJResource.resources[name].classObj
    }
    static call(funcName, parameters) {
        return JJResource.action(funcName, null, parameters)
    }
}
JJResource.resources = {}
JJResource.classRegex = /class ([a-zA-Z]*)/
class Tag {
    constructor() {
        this._subscriptions = new Map();
    }
    get subscriptions() {
        return this._subscriptions;
    }
	set subscriptions(s) {
		this._subscriptions = s
	}
    setup() { }
    init() { }
    ready() { }
    eval(code, element) {
        return eval("(" + code + ")")
    }
    load(url) {
        if (Tag.loaded.some((v) => v == url)) {
            return // todo return promise
        }

        var script = document.createElement("script");
        script.type = 'text/javascript'
        script.src = url

        var connected = new Promise(function (resolve) {
            script.onload = resolve
        })
        Tag.loaded.push({ url: url, promise: connected })

        document.head.appendChild(script)
        return connected
    }
    get tagName() {
        return this.tagModel.tagName;
    }
    call(funcName, parameters) {
        return Tag.call(funcName, parameters)
    }
    callJson(resource, parameters) {
        return JJResource.action(resource, null, parameters)
    }
    static callJson(resource, parameters) {
        return JJResource.action(resource, null, parameters)
    }
    static call(funcName, parameters) {
        return Tag.callJson(funcName, parameters);
    }
    fire(eventname, event = {}) {
        if (this.tagModel.events !== undefined) {
            let expression = this.tagModel.events[eventname];
            if (expression !== undefined) {
                //expression.call(this, this.parentTag, event);
                expression.callWithTagAndElementAndEvent(this.parentTag, this, event)
            }
            let expression2 = this.tagModel.events['event'];
            if (expression2 !== undefined) {
                expression2.callWithTagAndElementAndEvent(this.parentTag, this, { eventname, event })
            }
        }

    }
    static getModelElement(tagname) {
        let modelElement = Tag.tags[tagname].modelElement;
        return modelElement === undefined ? null : modelElement;
    }


    static parseModelTag(resource, tagData, tagname) { // TODO: DIRECTLY FETCH JSON INSTEAD OF TEXT 
        let implementation = resource.implementation
        if (implementation) {
            if (resource.configuration) {
                tagData.configuration = resource.configuration
            }
            if (implementation.javascript != undefined && implementation.javascript != '') {
                try {
                    tagData.classObj = resource.classObj
                    // tagData.classObj = eval('(' + implementation.javascript + ')');
                    tagData.classObj.bind(resource)
                    let classNames = JJResource.classRegex.exec(implementation.javascript)
                    window[classNames[1]] = tagData.classObj
                } catch (error) {
                    console.error('Tag "' + tagname + '" (implementation.javascript) could not be parsed:', error)
                    // link to bug, ?editor=resource=tagname&tab=implementation/javacript
                }
            }
            if (implementation.html !== undefined && implementation.html != '') {
                let domparser = new DOMParser();
                let tagEl = document.createElement('div')
                tagEl.innerHTML = implementation.html

                let modelElement = new ModelElement();
                let modelBrowserElement = (tagEl.children.length > 1) ? tagEl : tagEl.firstElementChild
                modelElement.parse(modelBrowserElement, {});
                Tag.tags[tagname].modelElement = modelElement;
            }
            if (implementation.css !== undefined && implementation.css != '') {
                var css = document.createElement("style");
                css.type = "text/css";
                css.innerHTML = implementation.css;
                document.head.appendChild(css);
            }
            if (tagData.classObj === undefined) {
                tagData.classObj = Tag; //tag with auto update of fields, etc.
            }
        }
        tagData.ready = true;

        return true;
    }
    static ready(tagname) {
        if (Tag.tags[tagname] == undefined) {
            Tag.tags[tagname] = { ready: false }
        }
        return JJResource.loaded(tagname).then(resource => {
            return Tag.parseModelTag(resource, Tag.tags[tagname], tagname)
        });
    }
    static getDefaults(tagname) {
        let tag = Tag.tags[tagname];
        if (tag === undefined) {
            return {}
        }
        return tag.configuration
    }
    static getClass(tagname) {
        let tag = Tag.tags[tagname];
        if (tag === undefined) {
            // console.warn('Tag ' + tagname + ' is not registered');
            return null;
        }
        if (tag.classObj === undefined) {
            return null;
        }

        return tag.classObj;
    }
    static isReady(tagname) {
        if (Tag.tags[tagname] === undefined) {
            return false
        }
        return (Tag.tags[tagname].ready === true);
    }
    static isRegistered(tagname) {
        if (tagname == undefined) {
            return false;
        }
        return Tag.tags[tagname] !== undefined;
    }
    static render(tagname, attributes = {}) {
        return TagModel.renderTag(tagname, attributes, null)
    }
    static clear(tagname) {
        Tag.tags[tagname] = undefined
        JJResource.resources[tagname] = undefined
        sessionStorage.removeItem('resource_'+tagname)
    }
    static register(tagname) {
        if (!Tag.tags[tagname]) {
            let url = '/api/resource.php?name=' + tagname
            Tag.tags[tagname] = { url: url, ready: false }
        }
    }
    static registerAndLoad(tagname) {
        Tag.tags[tagname] = { ready: false }
        return JJResource.loaded(tagname).then(resource => {
            if (!Tag.tags[tagname].ready) {
                Tag.tags[tagname] = resource
            }
            return resource;
        })
    }
    static registerPreloaded(tagname, fetchPromise) {
        Tag.tags[tagname] = { fetchPromise: fetchPromise, ready: false };
    }
    static registerFrameworkTag(tagname, classObj) {
        Tag.tags[tagname] = { classObj: classObj, ready: true };
    }
    publish(varname, object) {
        Tag.publish(varname, object) //JJ.publish()
    }
    static publish(varname, object) {
        window[varname] = object;
        notify(varname)
    }
    changed(property) {
        // this.update('property');
    }
    render(browserElement) { }
    subscribe(name, attribute, browserElement) {
        let subscriptions = this.subscriptions.get(name)
        if (!subscriptions) {
            subscriptions = []
            this.subscriptions.set(name, subscriptions)
        }
        subscriptions.push({ attribute: attribute, browserElement: browserElement })
        if (!browserElement.tagSubscriptions) {
            browserElement.tagSubscriptions = []
        }
        browserElement.tagSubscriptions.push({ name: name, tag: this });
    }
    unsubscribe(name, browserElement) {
        if (this.subscriptions) {
            let subscriptions = this.subscriptions.get(name)
            for (let i = subscriptions.length - 1; i >= 0; i--) {
                let subscription = subscriptions[i];
                if (subscription.browserElement == browserElement) {
                    subscriptions.splice(i, 1);
                }
            }
        }
    }
    subscribeTagAttribute(name, tagAttribute, tag, expression) {
        let subscriptions = this.subscriptions.get(name)
        if (!subscriptions) {
            subscriptions = []
            this.subscriptions.set(name, subscriptions)
        }
        subscriptions.push({ tagAttribute: tagAttribute, tag: tag, expression: expression });
    }
    unsubscribeTagAttribute(name, tag) {
        let subscriptions = this.subscriptions.get(name)
        if (subscriptions) {
            for (let subscription of subscriptions) {
                if (subscription.tag == tag) {
                    subscription.remove = true;
                }
            }
        }
    }
    updateItem(name, index) {
        this.update(name + '[' + index + ']')
    }
    updateAppended(name) {
        this.update(name + '.length')
    }
    setAttribute(name,value) {
        this[name] = value
        this.update('this.'+name)
    }
    update(name) { // Todo: use a local subscriptions object here?
        name = name.replace(/this/g, 'tag'); //bug, tag name will be replaced regex
        if (name.startsWith('tag.')) {
            if (!this.subscriptions) {
                return
            }
            let subscriptionKeys = this.subscriptions.keys()
            for (let subscriptionName of subscriptionKeys) {
                if (subscriptionName.startsWith(name)) {

                    let subscriptions = this.subscriptions.get(subscriptionName);
                    for (let subscriptionPath in subscriptions) {
                        let subscription = subscriptions[subscriptionPath];
                        if (subscription.remove !== true) {
                            if (subscription.attribute !== undefined) {
                                subscription.attribute.renderAttribute(subscription.browserElement, { tag: this, forIdx: subscription.browserElement.forIdx }); //
                            } else {
                                let tag = subscription.tag;
                                if (tag.destroyed === undefined) {
                                    let result = subscription.expression.callWithTagAndElement(tag.parentTag, tag)
                                    let code = 'tag.' + subscription.tagAttribute + ' = result'
                                    //let code = 'subscription.tag.' + subscription.tagAttribute + ' = ' + name.replace(/tag/g, 'this');
                                    eval(code); // todo: use compiled fn
                                    tag.update('tag.' + subscription.tagAttribute); //
                                }
                            }
                        }
                    }
                }
            }
        } else {
            notify(name);
        }
    }
    destroy() {
        this.tagModel.unsubscribeForParameterChanges(this)
        this.subscriptions = undefined
        this.destroyed = true
    }
}
Tag.tags = {};
Tag.loaded = []
//make static method
var matchAll = function (string) {
    const regex = /(([0-9a-zA-Z_$\.]|\[[0-9]{1,}\]|\[\'.*?\'\]|\[.*?\.forIdx.*?\]\]){2,})/g;
    const str = string;
    let m;
    var matches = [];
    while ((m = regex.exec(str)) !== null) {
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        m.forEach((match, groupIndex) => {
            if (groupIndex == 1) {
                matches.push(match);
            }
        });
    }
    //filter unique
    return matches;
};
class Expression {

    constructor(expression, options) {
        this.originalExpression = expression
        this.expression = expression;
        this.subscriptions = [];
        this.tagSubscriptions = [];
        this.parseExpression(options);
    }
    parseExpression(options) {
        this.expression = this.preprocessExpression(options)
        let code;
        let definitions = ''
        if (options.aliases) {
            for (let alias of options.aliases) {
                definitions += 'let ' + alias.varname + " = " + alias.expression + "\n"
            }
        }
        
		if (options.tagAndvalue) {
			code = '(function(tag,value) { ' + definitions + ' ' + this.expression + ' })';
        } else if (options.returnVoid) {
            code = '(function(element,node,tag,event) { ' + definitions + ' ' + this.expression + ' })';
        } else {
            code = '(function(element,node,tag,event) { ' + definitions + ' return (' + this.expression + ') })';
        }
        try {
            this.fn = eval(code);
        } catch (error) {
            console.error('Expresssion: parseExpression failed', code, error)
            this.fn = eval('(function() {return false})')
        }

    }
    parseSubscriptions(expression) {
        let expressionParts = matchAll(expression);
        for (let expressionPart of expressionParts) {
            if (expressionPart.startsWith('tag.')) {
                this.tagSubscriptions.push(expressionPart);
            } else if (expressionPart.indexOf('$') != -1) {
                this.subscriptions.push(expressionPart);
            }
        }
    }
    getTagSubscriptions(options) {
        if (options.forIdx) { //check text for forIdx
            let tagSubscriptions = [];
            for (let subscription of this.tagSubscriptions) {
                let newTagSubscription = subscription;
                for (let forIdxName in options.forIdx) {
                    let search = 'element.forIdx[\'' + forIdxName + '\']';
                    newTagSubscription = newTagSubscription.split(search).join(options.forIdx[forIdxName]);
                }
                tagSubscriptions.push(newTagSubscription) //regex
            }
            return tagSubscriptions;
        } else {
            return this.tagSubscriptions;
        }
    }
    preprocessExpression(options) {
        let expression = this.expression;
        if (options.jscontext === true) {
            expression = Expression.processJscontext(expression, options)
            this.parseSubscriptions(expression)
        } else if (expression.includes('{') || (options.textcontext === true)) {
            expression = Expression.convertToJavaScript(expression, options, this);
        } else {
            expression = Expression.processJscontext(expression, options)
            this.parseSubscriptions(expression)
        }
        return expression;
    }
    static processJscontext(expr, options) {
        expr = expr.replace(/ and /g, ' && ');
        expr = expr.replace(/ or /g, ' || ');
        expr = expr.replace(/ then /g, ' && ');
        expr = expr.replace(/this/g, 'tag');
        return expr;
    }
    static convertToJavaScript(expression, options, addSubscriptions = null) {
        let js = expression.replace(/(\s*[\n\r]+\s*)+/g, '')
        let processedJs = '';

        let jsContext = 0;
        let jscontextstr = '';
        let lastchar = '';
        for (let i = 0; i < js.length; i++) {
            let char = js[i];
            /*if (jsContext === 0 && ((char === ' ' && lastchar === ' ') || char === '\n' || char === '\t' || char === '\r')) {
            	lastchar = ' '
            	continue
            }*/
            if (jsContext === 0) lastchar = char;
            if (char === '{') {
                jsContext++;
                if (jsContext === 1) {
                    jscontextstr = '';
                    if (i > 0) {
                        processedJs += '\' + (';
                    } else {
                        processedJs += '('
                    }
                } else {
                    if (jsContext > 1)
                        jscontextstr += char
                    else
                        processedJs += char;
                }
            } else if (char === '}') {
                jsContext--;
                if (jsContext === 0) {
                    let processedJSContext = Expression.processJscontext(jscontextstr, options)
                    processedJs += processedJSContext
                    if (addSubscriptions !== null) {
                        addSubscriptions.parseSubscriptions(processedJSContext)
                    }
                    jscontextstr = ''
                    processedJs += ')'
                    if (i < (js.length - 1)) {
                        processedJs += ' + \'';
                    }
                } else {
                    jscontextstr += char;
                }
            } else {
                if (jsContext > 0) {
                    if (i === 0) {
                        jscontextstr += '\'';
                    }
                    jscontextstr += char;
                    if (i === js.length - 1) {
                        jscontextstr += '\'';
                    }
                } else {
                    if (i === 0) {
                        processedJs += '\'';
                    }
                    if (char == '\'') {
                        processedJs += '\\'
                    }
                    processedJs += char;
                    if (i === js.length - 1) {
                        processedJs += '\'';
                    }
                }
            }
        }
        processedJs += jscontextstr;
        return processedJs;
    }
    callWithElement(element, options) {
        try {
            return this.fn(element, element.node, element.tag, null);
        } catch (error) {
            console.error( (element.tag ? element.tag.tagModel.tagName : '?') +' - Error in Expression: "' + this.originalExpression + '" ' + error, (element ? element.tag : null), this.expression)
            return false
        }
    }
    callWithTag(tag) {
        return this.fn(null, null, tag, null);
    }
	callWithTagAndValue(tag,value) {
		return this.fn(tag,value)
	}
    callWithTagAndElement(tag, element) {
        try {
            return this.fn(element, null, tag, null);
        } catch (error) {

            console.error( (tag ? tag.tagModel.tagName : '') + 'callWithTagAndElement - error', 'expression', this.originalExpression, error, 'tag:', tag, 'element:', element, this)
            return false
        }
    }
    callWithTagAndElementAndEvent(tag, element, event) {
        try {
            return this.fn(element, null, tag, event);
        } catch (error) {
            console.error( (tag ? tag.name : '') +  'callWithTagAndElementAndEvent - error', 'expression', this.originalExpression, error, 'tag:', tag, 'element:', element, this)
            return true
        }
    }
    call(element, tag, event) {
        try {
            return this.fn(element, element.node, tag, event);
        } catch (error) {
            console.error( (tag ? tag.name : '') +  'callWithTagAndElementAndEvent - error', 'expression', this.originalExpression, error, 'tag:', tag, 'element:', element, this)
            return false
        }
    }
}
class Attribute {
    constructor(name, value, options) {
        this.name = name;
        this.value = value;
        this.expression = null;
        this.parse(options);
    }
    create(name, value) {
        return null;
    }
    subscribe(browserElement, options) {
        if (this.expression) {
            for (let subscription of this.expression.subscriptions) {
                browserElement.bind(this, subscription);
            }
            let tagSubscriptions = this.expression.getTagSubscriptions(options);
            for (let subscription of tagSubscriptions) {
                if (browserElement.tag) {
                    browserElement.tag.subscribe(subscription, this, browserElement);
                }
            }
        }
    }
    unsubscribe(browserElement) { }
    static parseAttribute(modelNode, name, value, options) {
        var attribute = Attribute.createAttribute(name, value, options);
        if (attribute !== null) {
            modelNode.removeAttribute(name);
            return attribute;
        }
        if (this.containsExpressions(value)) {
            return new ExpressionAttribute(name, value, options);
        }
        return null;
    }
    static registerAttribute(name, create) {
        Attribute.attributeTypes[name] = create;
        Attribute.attributeTypeNames.push(name);
    }
    static isRegistered(name) {
        return Attribute.attributeTypes[name] !== undefined;
    }
    static createAttribute(name, value, options) {
        var attrType = Attribute.attributeTypes[name];
        if (attrType !== undefined) {
            return new attrType(name, value, options);
        }
        if (name.substr(0, 1) == '(') {
            return new EventAttribute(name, value, options);
        }
        return null;
    }
    static containsExpressions(value) {
        return (value.indexOf('{') !== -1);
    }
    renderAttribute(browserElement, options) {
        if (browserElement.node) {
            let value;
            if (this.expression !== null) {
                value = this.expression.callWithElement(browserElement, options);
            } else {
                value = this.value
            }
            if (!value) {
                value = ''
            }
            this.render(browserElement.node, value, browserElement)
        }
    }
    parse(options) {
        let newOptions = Object.assign({}, options, { textcontext: true })
        this.expression = new Expression(this.value, newOptions);
    }
    destroy() { }
}
Attribute.browserAttribute = false;
Attribute.attributeTypeNames = [];
Attribute.attributeTypes = {};
class ExpressionAttribute extends Attribute {
    render(node, value) {
        if (node) {
            if (value) {
                if (node.setAttribute) {
                    node.setAttribute(this.name, value);
                }
            } else {
                node.removeAttribute(this.name);
            }
        }
    }
}
class EventAttribute extends Attribute {
    parse(options) {
        this.eventName = this.name.substr(1, this.name.length - 2);
        let newOptions = Object.assign({}, options, { returnVoid: true })
        let definitions = ''
        if (options.aliases) {
            for (let alias of options.aliases) {
                definitions += 'let ' + alias.varname + " = " + alias.expression + "\n"
            }
        }
        this.code = '(function(element,node,tag,event) { ' + definitions + Expression.processJscontext(this.value, newOptions) + ' } )';
    }
    subscribe(element) {
        //should save event on element...to destroy when browser element is destroyed?
        let onEvent = function (event) {
            if (this.eventAttribute.fn == undefined) {
                this.eventAttribute.fn = eval(this.eventAttribute.code);
            }
            this.eventAttribute.fn(this.element, this.element.node, this.element.tag, event)
        }.bind({ element: element, eventAttribute: this });

        element.node.addEventListener(this.eventName, onEvent);
    }
    unsubscribe(browserElement) {
        browserElement.node.removeEventListener(this.eventName, this.onevent);
    }
    destroy() {
        this.expression = null;
    }
    renderAttribute(browserElement) {
        /* do nothing */
    }
}
class ModelAttribute extends Attribute {
    parse(options) {
        let eventCode = this.value + ' = node.value;this.update(\'' + this.value + '\');'
        this.eventAttribute = new EventAttribute('(input)', eventCode, options)
        this.expressionAttribute = new ExpressionAttribute('value', '{' + this.value + '}', options)
    }
    subscribe(element) {
        this.eventAttribute.subscribe(element)
    }
    renderAttribute(browserElement, options) {
        this.expressionAttribute.renderAttribute(browserElement, options)
    }
    unsubscribe(browserElement) {
        this.eventAttribute.unsubscribe(browserElement)
    }
    destroy() {
        this.eventAttribute.destroy()
        this.expressionAttribute.destroy()
    }
}
Attribute.registerAttribute('model', ModelAttribute);
class TextNodeAttribute extends Attribute {
    render(node, value) {
        node.nodeValue = value;
    }
}
class TextareaNodeAttribute extends Attribute {
    render(node, value) {
        node.value = value;
    }
}



class ForAttribute extends Attribute {
    parse(options) {
        let arr = this.value.split(' of ');
        let variable = arr[0];
        this.collection = arr[1].replace(/this/g, 'tag');
        this.expression = new Expression(this.collection, options);
        if (this.expression.subscriptions.length == 1) {
            this.expression.subscriptions[0] += '.length';
        }
        if (this.expression.tagSubscriptions.length == 1) {
            this.expression.tagSubscriptions[0] += '.length';
        }
        if (options.aliases === undefined) {
            options.aliases = [];
        }
        let idxexpr = 'element.forIdx[\'' + this.collection + '\']'
        let expression = this.collection + '[' + variable + '_index]'
        options.currentForIndex = variable + '_index'
        options.currentCollection = this.collection
        options.aliases.push({ varname: options.currentForIndex, expression: idxexpr, replaceForSubscription: true });
        options.aliases.push({ varname: variable, expression: expression });
    }
    /*removeSubelements(browserElement, newLength) {
        let brChildren = browserElement.children
        for (let i = brChildren.length - 1; i >= 0; i--) {
            let child = brChildren[i];
            if (child.forIdx[this.collection] > (newLength - 1)) {
                child.destroy(); 
                brChildren.splice(i, 1)
            } else {
                break;
            }
        }
        let lastEl = brChildren[brChildren.length - 1];
        return lastEl ? lastEl.forIdx[this.collection] + 1 : 0;
    }*/
    renderAttribute(browserElement, options) {
        
        options.ignoreThis = true
        let collection = null;
        collection = this.expression.callWithElement(browserElement, options);

        if (!collection) {
            collection = []
        }
        let newBrowserEl = null;
        browserElement.destroySubitems()
        browserElement.children = []
        let lastEl = 0

        if (collection) {
            if (lastEl === 0) {
                browserElement.node.innerHTML = "";
            }
            for (let i = lastEl; i < collection.length; i++) {
                let cOptions = Object.assign({}, options)
                cOptions.renderChildren = true
                if (cOptions.forIdx) {
                    cOptions.forIdx = Object.assign({}, cOptions.forIdx, {
                        [this.collection]: i
                    })
                } else {
                    cOptions.forIdx = {
                        [this.collection]: i
                    }
                }
                let childBrowserEl = browserElement.modelElement._renderChildren(cOptions, null);
                browserElement.children.push(childBrowserEl);
                let childNodes = Array.from(childBrowserEl.node.childNodes);
                childBrowserEl.childNodes = [];
                for (let node of childNodes) {
                    browserElement.node.appendChild(node);
                    childBrowserEl.childNodes.push(node)
                }

            }
        }
        options.renderChildren = false;

        options.ignoreThis = false
    }
}
Attribute.registerAttribute('for', ForAttribute);
class IfAttribute extends Attribute {
    renderAttribute(browserElement, options) {
        if (this.ignoreThis === true) {
            //   return This RETURN CAUSES SOME PROBLEMS,....
        }
        this.ignoreThis = true;
        options.render = this.getRender(browserElement);
        if (options.render === true) {
            if (browserElement.node === null || browserElement.node.nodeType === 8) {
                browserElement.render(options);
            }
            //browserElement.render(options);
        } else {
            browserElement.unplace('if (' + this.expression.expression + ')');
        }
        this.ignoreThis = false;
    }
    parse(options) {
        let newOptions = Object.assign({}, options, { jscontext: true })
        this.expression = new Expression(this.value, newOptions);
    }
    getRender(browserElement) {
        return (this.expression.callWithElement(browserElement) == true);
    }
}
Attribute.registerAttribute('if', IfAttribute);
class LastAttribute extends IfAttribute {
    parse(options) {
        this.value = '('+options.currentCollection + '.length - 1) === ' + options.currentForIndex
        super.parse(options)
    }
}
Attribute.registerAttribute('last', LastAttribute);
class FirstAttribute extends IfAttribute {
    parse(options) {
        this.value = '0 === ' + options.currentForIndex
        super.parse(options)
    }
}
Attribute.registerAttribute('first', FirstAttribute);
class ElementAttribute extends Attribute {
    renderAttribute(browserElement) {
        browserElement.tag[this.value] = browserElement.node;
    }
}
Attribute.registerAttribute('element', ElementAttribute);
class LinkAttribute extends Attribute {
    subscribe(browserElement) {
        let onEvent = function (event) {
            if (browserElement.link.startsWith('/'))
                router$.goto(browserElement.link);
            else
                router$.go(browserElement.link);
        }.bind(this);

        browserElement.node.addEventListener('click', onEvent);
    }
    render(node, value, browserElement) {
        browserElement.link = value;
    }

}
Attribute.registerAttribute('link', LinkAttribute);
class IncludeTag extends Tag {
    render(browserElement) {
        if (browserElement == null) {
            browserElement = new BrowserElement(document.createElement('div'))
            this.browserElement = browserElement
        }
        if (this._tag) {
            JJResource.loaded(this._tag).then(resource => {
                this.renderedTag = TagModel.renderTag(this._tag, this.attributes, null, { tag: this.parentTag }, this.tagModel.events)
                browserElement.node.innerHTML = ''
                if (this.renderedTag) {
                    browserElement.node.appendChild(this.renderedTag.node)
                }
            });
        }
        return browserElement
    }
    set tag(tag) {
        if (!tag || tag.toLowerCase() == this._tag) {
            return;
        }
        this._tag = tag.toLowerCase();
        if (this.browserElement)
            this.render(this.browserElement);
    }
    get tag() {
        return this._tag;
    }
    set attributes(a) {
        this._attributes = a
        if (this.renderedTag && this.renderedTag.tag) {
            Object.assign(this.renderedTag.tag,a)
        }
        /*if (this.browserElement) {//don't include multiple times
            this.render(this.browserElement);
        }*/
    }
    get attributes() {
        return this._attributes
    }
}
Tag.registerFrameworkTag('include', IncludeTag)
