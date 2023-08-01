from flask import Flask, render_template, request
import redis
import re
import os
import json
import secrets
from config import authorized_keys


debug = False
if 'FLASK_DEBUG' in os.environ:
    debug = bool(os.environ['FLASK_DEBUG'])

app = Flask(__name__)

if debug:
    r = redis.Redis(host='localhost', port='6379', decode_responses=True)
else:
    r = redis.Redis(host='redis', port='6379', decode_responses=True)

@app.route("/")
def index():
    api_key = request.args.get("k")
    if api_key is None:
        api_key = ""

    listnames = []
    for i, key in enumerate(r.scan_iter(match='lists:*')):
        m = re.match(r'lists:(.*)', key)
        listname = m.group(1)
        
        listnames.append(listname)

    return render_template('index.html', listnames=listnames, api_key=api_key)


@app.route("/api/v1/items")
def get_items():
    # check if the request is authorized, return an empty list if not
    key = request.args.get("k")
    if not safe_isin(key, authorized_keys):
        return json.dumps([])

    # retreive the data in case of successful authorization
    item_ids = get_item_ids_from_redis()
    titles = map(get_title_from_redis, item_ids)
    item_tags = map(get_item_tags_from_redis, item_ids)
    item_tags = map(list, item_tags)

    items = [{'id': item_id, 'title': title, 'tags': tags} 
             for item_id, title, tags in zip(item_ids, titles, item_tags)]

    return json.dumps(items)


def get_item_ids_from_redis():
    return r.zrange('items', 0, -1, desc=True)


def get_title_from_redis(item_id):
    return r.get(f'items:{item_id}:title')


def get_item_tags_from_redis(item_id):
    return r.smembers(f'items:{item_id}:tags')


def safe_isin(x, collection):
    for elt in collection:
        if secrets.compare_digest(x, elt):
            return True

    return False
