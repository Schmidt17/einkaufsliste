from flask import Flask, render_template, request, abort
import redis
import re
import os
import json
import secrets
import uuid
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


@app.get("/api/v1/items")
def get_items():
    # check if the request is authorized, return an error if not
    key = request.args.get("k")
    if not safe_isin(key, authorized_keys):
        abort(401)  # unauthorized

    # retreive the data in case of successful authorization
    item_ids = get_item_ids_from_redis()
    titles = map(get_title_from_redis, item_ids)
    item_tags = map(get_item_tags_from_redis, item_ids)
    item_tags = map(list, item_tags)

    items = [{'id': item_id, 'title': title, 'tags': tags} 
             for item_id, title, tags in zip(item_ids, titles, item_tags)]

    return json.dumps(items)


@app.post("/api/v1/items")
def post_item():
    # check if the request is authorized, return an error if not
    key = request.args.get("k")
    if not safe_isin(key, authorized_keys):
        abort(401)  # unauthorized

    add_item(request.json['itemData'])

    return {'success': True}


@app.route("/api/v1/items/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    # check if the request is authorized, return an error if not
    key = request.args.get("k")
    if not safe_isin(key, authorized_keys):
        abort(401)  # unauthorized

    delete_item_from_redis(item_id)

    return {'success': True}


@app.get("/api/v1/tags")
def get_tags():
    # check if the request is authorized, return an error if not
    key = request.args.get("k")
    if not safe_isin(key, authorized_keys):
        abort(401)  # unauthorized

    tags = get_all_tags_from_redis()
    return {'tags': list(tags)}


def get_all_tags_from_redis():
    return r.smembers('tags')


def delete_item_from_redis(item_id):
    # delete entry from items sorted set
    r.zrem('items', item_id)

    # delete title
    r.delete(f'items:{item_id}:title')

    # delete tags
    r.delete(f'items:{item_id}:tags')
    # update the global tags set
    update_tags_set_in_redis()


def update_tags_set_in_redis():
    # get all item IDs
    item_ids = get_item_ids_from_redis()
    # construct all tag keys from the item ids
    tag_keys = [f'items:{item_id}:tags' for item_id in item_ids]

    # store the union of all tag sets in the global tag set
    r.sunionstore('tags', *tag_keys)


def add_item(item_data):
    # create new ID
    new_id = str(uuid.uuid4())

    # add ID to item ordered set
    # find current highest score
    high_id, high_score = get_highscore_item_from_redis()
    # increment score and add item
    new_score = high_score + 1
    add_item_to_redis(new_id, new_score)

    # add title
    add_title_to_redis(new_id, item_data['title'])

    # add tags
    add_tags_to_redis(new_id, item_data['tags'])


def get_item_ids_from_redis():
    return r.zrange('items', 0, -1)


def get_highscore_item_from_redis():
    items = r.zrange('items', 0, 0, desc=True, withscores=True)

    if items:
        return items[0]
    else:
        return None, None


def add_item_to_redis(item_id, score):
    r.zadd('items', {item_id: score})


def add_title_to_redis(item_id, title):
    r.set(f'items:{item_id}:title', title)


def add_tags_to_redis(item_id, tags):
    for tag in tags:
        r.sadd('tags', tag)  # add to global tag set
        r.sadd(f'items:{item_id}:tags', tag)  # add to item tag set


def get_title_from_redis(item_id):
    return r.get(f'items:{item_id}:title')


def get_item_tags_from_redis(item_id):
    return r.smembers(f'items:{item_id}:tags')


def safe_isin(x, collection):
    for elt in collection:
        if secrets.compare_digest(x, elt):
            return True

    return False
