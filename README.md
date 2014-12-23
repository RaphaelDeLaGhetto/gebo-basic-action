gebo-basic-action
================

Actions common to gebo agents

This collection of actions comes bundled with the
[gebo-server](https://github.com/RaphaelDeLaGhetto/gebo-server/). It is useful
for writing
[new actions](https://github.com/RaphaelDeLaGhetto/grunt-init-gebo-action) that
depend on the basic action set.

# Setup your database (MongoDB)

Install MongoDB on your system, if you haven't already:

* [http://docs.mongodb.org/manual/installation/](http://docs.mongodb.org/manual/installation/)

Start MongoDB by executing this at the command line:

```
sudo service mongodb start
```

# Install

```
npm install gebo-basic-actions
```

# Test 

```
grunt nodeunit
```

## License

MIT
