import json
import os
import time
import requests
from flask import request


config = {
    # Intervals
    "staticDataRefreshTime": 120,
    "liveDataRefreshTime": 9,

    # URLs
    "rootUrl": "https://www.flightradar24.com/",
    "cdnUrl": "https://cdn.flightradar24.com/",
    "liveUrl": "https://data-live.flightradar24.com/",
    "cloudUrl": "https://data-cloud.flightradar24.com/",

    # File Paths
    "staticDataFile": "functions/airtraffic/staticData.json",
    "liveDataFile": "functions/airtraffic/liveData.json"
}


def __getFileContent(filePath):
    with open(filePath,"r") as file:
        return file.read()

def __setFileContent(filePath,content):
    if __fileExists(filePath):
        __deleteFile(filePath)
    with open(filePath,"a") as file:
        file.write(content)
        file.flush()
        file.close()

def __deleteFile(filePath):
    os.remove(filePath)

def __fileExists(filePath):
    return os.path.exists(filePath)

def __resetFile(filePath):
    if __fileExists(filePath):
        __deleteFile(filePath)
    __setFileContent(filePath,json.dumps({
        "lastUpdate": 0
    }))


def __updateStaticData():
    while not __fileExists(config.get("staticDataFile")):
        time.sleep(0.5)
        if __fileExists(config.get("staticDataFile")):
            return __getFileContent(config.get("staticDataFile"))
    try:
        __deleteFile(config.get("staticDataFile"))

        newData = {
            "lastUpdate": time.time(),
            "airports": {},
            "airlines": {}
        }

        responseAirports = requests.get(
            url = config.get("rootUrl") + "_json/airports.php",
            headers = {
                "Accept": "*/*",
                "User-Agent": request.headers.get("User-Agent")
            }
        )
        if responseAirports.ok:
            responseAirportsJson = responseAirports.json()
            for element in responseAirportsJson.get("rows"):
                newData["airports"][element.get("iata")] = {
                    "name": element.get("name"),
                    "icao": element.get("icao"),
                    "latitude": element.get("lat"),
                    "longitude": element.get("lon"),
                    "country": element.get("country"),
                    "altitude": element.get("alt")
                }
        else:
            __resetFile("staticDataFile")
            return __getFileContent("staticDataFile")

        responseAirlines = requests.get(
            url = config.get("rootUrl") + "_json/airlines.php",
            headers = {
                "Accept": "*/*",
                "User-Agent": request.headers.get("User-Agent")
            }
        )
        if responseAirlines.ok:
            responseAirlinesJson = responseAirlines.json()
            for element in responseAirlinesJson.get("rows"):
                newData["airlines"][element.get("ICAO")] = {
                    "name": element.get("Name"),
                    "code": element.get("Code")
                }
        else:
            __resetFile("staticDataFile")
            return __getFileContent("staticDataFile")
        
        newDataString = json.dumps(newData)
        __setFileContent(config.get("staticDataFile"),newDataString)
        return newData
    except:
        __resetFile("staticDataFile")
        return __getFileContent("staticDataFile")

    

def __updateLiveData():
    while not __fileExists(config.get("liveDataFile")):
        time.sleep(0.5)
        if __fileExists(config.get("liveDataFile")):
            return __getFileContent(config.get("liveDataFile"))
    try:
        __deleteFile(config.get("liveDataFile"))

        newData = {
            "lastUpdate": time.time(),
            "objects": {},
            "stats": {},
            "count": -1,
            "version": -1
        }

        responseObjects = requests.get(
            url = "https://data-cloud.flightradar24.com/zones/fcgi/feed.js",
            headers = {
                "Accept": "*/*",
                "User-Agent": request.headers.get("User-Agent")
            },
            params = {
                "faa": "1",
                "satellite": "1",
                "mlat": "1",
                "flarm": "1",
                "adsb": "1",
                "gnd": "1",
                "air": "1",
                "vehicles": "0",
                "estimated": "1",
                "maxage": "14400",
                "gliders": "1",
                "stats": "1"
            }
        )
        if responseObjects.ok:
            responseObjectsJson = responseObjects.json()
            for key in responseObjectsJson.keys():
                if key != "full_count" and key != "version" and key != "stats":
                    element = responseObjectsJson.get(key)
                    newData["objects"][key] = {
                        "icao": element[0],
                        "latitude": element[1],
                        "longitude": element[2],
                        "direction": element[3],
                        "altitude": element[4],
                        "speed": element[5],
                        "code": element[8],
                        "registration": element[9],
                        "time": element[10],
                        "start_airport": element[11],
                        "destination_airport": element[12],
                        "iata_airline": element[13],
                        "grounded": element[14],
                        "vertical_speed": element[15],
                        "callsign": element[16],
                        "icao_airline": element[18]
                    }
                else:
                    if key == "full_count":
                        newData["count"] = responseObjectsJson.get(key)
                    elif key == "stats":
                        newData["stats"] = responseObjectsJson.get(key).get("total")
                    elif key == "version":
                        newData["version"] = responseObjectsJson.get(key)
        newDataString = json.dumps(newData)
        __setFileContent(config.get("liveDataFile"),newDataString)
        return newData
    except:
        __resetFile("staticDataFile")
        return __getFileContent("staticDataFile")


def staticdata():
    staticContentJson = json.loads(__getFileContent(config.get("staticDataFile")))
    if (time.time() - staticContentJson.get("lastUpdate")) >= config.get("staticDataRefreshTime"):
        return __updateStaticData()
    return staticContentJson

def livedata():
    if __fileExists(config.get("liveDataFile")):
        liveContentJson = json.loads(__getFileContent(config.get("liveDataFile")))
        if (time.time() - liveContentJson.get("lastUpdate")) >= config.get("liveDataRefreshTime"):
            return __updateLiveData()
        return liveContentJson
    else:
        return __updateLiveData()

def flightdetails():
    flightId = request.args.get("id")
    
    detailsResponse = requests.get(
        url = config.get("liveUrl") + "clickhandler",
        params = {
            "flight": flightId
        },
        headers = {
            "Accept": "*/*",
            "User-Agent": request.headers.get("User-Agent")
        }
    )
    if not detailsResponse.ok:
        return detailsResponse.text,detailsResponse.status_code
    detailsResponseJson = detailsResponse.json()
    detailsResponseJson.pop("s")
    return detailsResponseJson

def airportdetails():
    airportId = request.args.get("id")

    detailsResponse = requests.get(
        url = config.get("rootUrl") + "airports/traffic-stats",
        params = {
            "airport": airportId
        },
        headers = {
            "Accept": "*/*",
            "User-Agent": request.headers.get("User-Agent")
        }
    )
    if not detailsResponse.ok:
        return detailsResponse.text,detailsResponse.status_code
    detailsResponseJson = detailsResponse.json()
    return detailsResponseJson