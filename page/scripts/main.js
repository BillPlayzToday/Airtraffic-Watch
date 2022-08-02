iconMap = {
    "live": null,
    "static": null
}

const config = {
    fetchUrl: ""
}

const iconStyles = { // Define styles for creating the ol/Feature object with a cloned version
    "airport": new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 0.5],
            anchorXUnits: "fraction",
            anchorYUnits: "fraction",
            scale: 0.1367, // approx. 70px (from 512px) // Resize the icon because it's saved at a higher resolution

            src: "images/flag.png"
        })
    }),
    "plane": new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 0.5],
            anchorXUnits: "fraction",
            anchorYUnits: "fraction",
            scale: 0.0488, // approx. 25px (from 512px) // Resize the icon because it's saved at a higher resolution

            src: "images/plane-orange.png"
        })
    })
}


const iconVectorSource = new ol.source.Vector({ // Layer for all the icons
    features: []
})


class httpRequests {
    createParamString(params) { // Function to create query string from a table
        var finalString = "?"
        Object.keys(params).forEach(function (paramName) {
            finalString = finalString + paramName + "=" + params[paramName] + "&"
        })
        finalString = finalString.slice(0, finalString.length - 1)
        return finalString
    }

    createRequest(method, url, headers, params, callbackFunc, callbackArgs) { // Function to create easy http requests
        var request = new XMLHttpRequest()
        request.open(method, url + this.createParamString(params)) // Open request with the url and the applied createParamString() function appended
        Object.keys(headers).forEach(function (headerName) { // Parse headers over into the request
            request.setRequestHeader(headerName, headers[headerName])
        })
        request.addEventListener("load", function () { // Connect loaded event
            callbackFunc(this, ...callbackArgs) // Call the callbackFunc() along with the current XMLHttpRequest() class and the callbackArgs
        })
        request.send() // Send request
    }
}

class activeIcons {
    showIcon(feature) {
        if (iconVectorSource.hasFeature(feature)) {
            console.warn("showIcon() called on already existsing icon. Use moveIcon() instead.")
            this.hideIcon(feature) // Do what the dev says anyways
        }

        iconVectorSource.addFeature(feature) // Add the icon to the previously created icon layer iconVectorSource
    }

    hideIcon(feature) {
        if (!iconVectorSource.hasFeature(feature)) { // Cancel without comment if the icon doesn't exist (anymore)
            return
        }

        iconVectorSource.removeFeature(feature) // Remove the icon from the icon layer iconVectorSource
    }

    moveIcon(feature, position, rotationDeg) {
        if (!iconVectorSource.hasFeature(feature)) { // Cancel without comment if the icon doesn't exist (anymore)
            return
        }

        feature.setGeometry( // Set the position by recreating the ol.geom.Point geometry with the new position
            new ol.geom.Point(ol.proj.fromLonLat(position))
        )
        var currentStyle = feature.getStyle().clone() // Clone the old unrotated style, NOT replace it to prevent flickering
        var currentStyleImage = currentStyle.getImage() // Get the image, no need to clone because we are already operating on a cloned object that is not yet applied
        currentStyleImage.setRotation(rotationDeg * Math.PI / 180) // Modify the rotation property by function and convert it to radians
        currentStyle.setImage(currentStyleImage) // Apply the image to the style (No idea if this is actually neccessary)
        feature.setStyle(currentStyle) // Finally apply the new style to the icon
    }

    iconExists(featureName) { // Also used to get an icon by it's name
        var features = iconVectorSource.getFeatures() // Save as variable because we have to access it 2 times
        var indexPosition = features.findIndex(function (feature) {
            return feature.A.name == featureName
        })
        return features[indexPosition]
    }
}

class inactiveIcons {
    updateLive() {
        classes.actions.getLiveData(function (newData) { // Call the getLiveData() function along with the following callback
            var oldIconMap = iconMap // Save the old icon map
            iconMap.live = {} // Reset the .live property of the actual iconMap variable
            Object.keys(newData.objects).forEach(function (flightId) { // Loop through the flights
                var flightData = newData.objects[flightId]

                var featureValue = null
                if (oldIconMap.live[flightId]) { // If the flight already existed before the update (Always false if this is the first time called)
                    featureValue = oldIconMap.live[flightId].feature
                    classes.activeIcons.moveIcon(oldIconMap.live[flightId].feature,[flightData.longitude,flightData.latitude],flightData.direction) // We're not actually moving an ACTIVE icon
                    delete oldIconMap.live[flightId] // Delete it from the oldIconMap in favour of the loop at the end of this function
                } else {
                    featureValue = new ol.Feature({ // Create the new feature
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([flightData.longitude, flightData.latitude])), // Along with the ol.geom.Point geometry, which is required to set a position
                        name: flightId // And the (ignored by the module) name property to determine later on what flight this icon is
                    })
                    var newStyle = iconStyles.plane.clone() // Clone the old style again to prevent flickering
                    var newStyleImage = newStyle.getImage() // Get image to modify the rotation in the next line
                    newStyleImage.setRotation(flightData.direction * Math.PI / 180) // Set the new rotation with the setRotation() function and convert degrees to radians
                    newStyle.setImage(newStyleImage) // Apply the modified image (Still no idea if this is neccessary)
                    featureValue.setStyle(newStyle) // Finally apply the style
                }

                iconMap.live[flightId] = { // Create the object for the flight
                    "data": flightData,
                    "feature": featureValue
                }
            })

            Object.keys(oldIconMap.live).forEach(function (flightId) { // Delete flights that are no longer listed (Landed or crashed O_O)
                var flightData = oldIconMap.live[flightId]

                classes.activeIcons.hideIcon(flightData.feature)
            })
        })
    }

    updateStatic() { // SHOULD ONLY CALL ONCE! This function basically works the same as the updateLive() function, though it does not support moving of icons which will cause warnings but not errors.
        classes.actions.getStaticData(function (newData) {
            var oldIconMap = iconMap

            iconMap.static = {
                "airlines": newData.airlines,
                "airports": {}
            }
            Object.keys(newData.airports).forEach(function (airportName) {
                var airportValue = newData.airports[airportName]

                var featureValue = new ol.Feature({
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([airportValue.longitude, airportValue.latitude])),
                    name: airportName
                })
                featureValue.setStyle(iconStyles.airport.clone())

                iconMap.static.airports[airportName] = {
                    "data": airportValue,
                    "feature": featureValue
                }
            })

            if (oldIconMap.airports) {
                Object.keys(oldIconMap.airports).forEach(function (airportName) {
                    var airportValue = oldIconMap.airports[airportName]

                    classes.activeIcons.hideIcon(airportValue.feature)
                })
            }
        })
    }
}

class actions {
    __errorHandler(requestClass, callbackFunc) { // Errorhandler which processes http responses
        if (requestClass.status == 200) { // Request is OK
            if (!callbackFunc) { // Dead end, just return
                return
            }
            callbackFunc(JSON.parse(requestClass.responseText)) // Call the callback along with the json-parsed response text as an object
        } else { // Request didn't return expected output, try to describe the error
            console.log("FAIL! Something is wrong with the request")
            console.log("----- OBJECT -----")
            try {
                console.log(requestClass) // Browser console can't log javascript objects (shouldn't happen)
            } catch (error) {
                console.log("Can't log object.")
                console.log("Code: " + requestClass.status + " (" + requestClass.statusText + ")")
                console.log("Text: " + requestClass.responseText)
            }
            console.log("----- TRACE/STACK -----")
            console.trace() // Print the stack (called trace here)
        }
    }

    getStaticData(callbackFunc) { // Just a translator that makes stuff easier, so we don't have to construct the whole request by hand every call
        classes.httpRequests.createRequest("GET", config.fetchUrl + "staticdata", {
            "Accept": "*/*"
        }, {}, this.__errorHandler, [callbackFunc])
    }

    getLiveData(callbackFunc) { // Same here
        classes.httpRequests.createRequest("GET", config.fetchUrl + "livedata", {
            "Accept": "*/*"
        }, {}, this.__errorHandler, [callbackFunc])
    }

    renderStaticData() {
        if (iconMap.static == null) { // Nothing yet saved (request is probably still pending, which is alright)
            return
        }

        var renderAirports = (map.getView().getZoom() > 6.5) // Don't render airports until a specific zoom level

        Object.keys(iconMap.static.airports).forEach(function (airportName) {
            var airportValue = iconMap.static.airports[airportName]

            if (renderAirports && classes.utility.isPointVisible([airportValue.data.longitude, airportValue.data.latitude])) { // Check if the airport should be visible and if we even render airports at all
                if (!classes.activeIcons.iconExists(airportName)) { // If it isn't loaded yet
                    classes.activeIcons.showIcon(airportValue.feature) // Call the showIcon() function along with the predefined feature (icon) from the inactiveIcons class
                }
            } else { // Remove icon if it should not be visible (Will return if the icon doesnt exist)
                classes.activeIcons.hideIcon(airportValue.feature)
            }
        })
    }

    renderLiveData() { // Function works basically the same as the previous one
        if (iconMap.live == null) {
            return
        }

        Object.keys(iconMap.live).forEach(function (flightId) {
            var flightValue = iconMap.live[flightId]

            if (classes.utility.isPointVisible([flightValue.data.longitude, flightValue.data.latitude])) {
                var featureIcon = classes.activeIcons.iconExists(flightId)
                if (featureIcon) {
                    classes.activeIcons.moveIcon(featureIcon, [flightValue.data.longitude, flightValue.data.latitude], flightValue.data.direction)
                } else {
                    classes.activeIcons.showIcon(flightValue.feature)
                }
            } else {
                classes.activeIcons.hideIcon(flightValue.feature)
            }
        })
    }
}

class utility {
    isPointVisible(coordinates) { // Check if a point is in the clients viewport
        var viewArea = this.getViewArea() // Get the viewport
        return ( // Check if the passed arguments are in between the viewport bounds
            coordinates[0] > viewArea[0][0] &&
            coordinates[0] < viewArea[1][0] &&
            coordinates[1] > viewArea[0][1] &&
            coordinates[1] < viewArea[1][1]
        )
    }

    removeElementsByClass(className) { // Remove elements of the html document by their class
        var elements = document.getElementsByClassName(className)
        while (elements.length > 0) {
            var element = elements[0]
            element.parentNode.removeChild(element)
        }
    }

    toLonLat(coordinates) { // Convert coordinate format
        return ol.proj.toLonLat(coordinates, "EPSG:900913")
    }

    getViewArea() { // Get the ma
        var rawBoundingBox = map.getView().calculateExtent(map.getSize())
        return [ // Return in another order, because the return type by the module is: 1st position = bottom left and 2nd position = top right. And then convert them with the toLonLat() function
            this.toLonLat([rawBoundingBox[0], rawBoundingBox[1]]),
            this.toLonLat([rawBoundingBox[2], rawBoundingBox[3]])
        ]
    }
}

const classes = { // Load the classes in an object (sorry)
    "httpRequests": new httpRequests(),
    "activeIcons": new activeIcons(),
    "inactiveIcons": new inactiveIcons(),
    "actions": new actions(),
    "utility": new utility()
}

function initBody() { // Function called by the html document after the html body is loaded
    const source = new ol.source.XYZ({ // Use openstreetmaps tile servers
        url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    })

    map = new ol.Map({ // Create the map object
        target: "map", // Define the div id (from the html document)
        layers: [ // Set the layer order
            new ol.layer.Tile({ // Map tiles
                source: source
            }),
            new ol.layer.Vector({ // Icons
                source: iconVectorSource
            })
        ],
        view: new ol.View({ // Set the start view
            center: ol.proj.fromLonLat([-73.7789, 40.639751]), // John F. Kennedy Airport in New York (JFK)
            zoom: 7 // Zoom in so we can see the airports so users get the system with airport loadingcon zoom
        }),
        interactions: ol.interaction.defaults({ altShiftDragRotate: false, pinchRotate: false }) // Disable rotation because it messes up icons
    })

    classes.utility.removeElementsByClass("ol-rotate-reset") // Remove the rotation reset button because we disable rotation

    classes.inactiveIcons.updateStatic() // Start a request to load the static data (airports and airlines)
    setInterval(function () { // Render interval
        classes.actions.renderStaticData()
        classes.actions.renderLiveData()
    }, 500)
    setInterval(function () { // Plane position update interval
        classes.inactiveIcons.updateLive()
    }, 5000)
}