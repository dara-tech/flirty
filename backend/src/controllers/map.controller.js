import MapModel from "../model/map.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const createMap = async (req, res) => {
    try {
      console.log("Request Body:", req.body);
  
      const { name, description, coordinates } = req.body;
  
      // If coordinates are passed as an object, convert them to an array
      let coords = coordinates;
      if (coordinates.latitude && coordinates.longitude) {
        coords = [coordinates.longitude, coordinates.latitude];
      }
  
      // Validate if coordinates are in the correct format (array of two numbers)
      if (!Array.isArray(coords) || coords.length !== 2 || !coords.every(num => typeof num === "number")) {
        return res.status(400).json({ error: "Coordinates must be an array of two numbers [longitude, latitude]" });
      }
  
      const [longitude, latitude] = coords;
  
      // Validation: Check if longitude and latitude are within valid ranges
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        return res.status(400).json({
          error: "Invalid coordinates: Longitude must be between -180 and 180, Latitude must be between -90 and 90."
        });
      }
  
      // Check if the coordinates already exist in the database
      const existingMap = await MapModel.findOne({ "coordinates.coordinates": coords });
      if (existingMap) {
        return res.status(409).json({ error: "Map with these coordinates already exists." });
      }
  
      // Create new map
      const createdBy = req.user._id;
      const newMap = new MapModel({
        name,
        description,
        coordinates: {
          type: 'Point',
          coordinates: coords
        },
        createdBy
      });
  
      // Save new map to the database
      await newMap.save();
  
      // Emit event to notify about the new map creation
      io.emit('newMap', newMap);
  
      // Respond with the created map data
      res.status(201).json(newMap);
  
    } catch (error) {
      console.error("Error in createMap controller:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  

export const updateMap = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, coordinates } = req.body;

    if (coordinates && (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(num => typeof num === "number"))) {
      return res.status(400).json({ error: "Coordinates must be an array of two numbers [longitude, latitude]." });
    }

    const existingMap = await MapModel.findById(id);
    if (!existingMap) {
      return res.status(404).json({ error: "Map not found" });
    }

    existingMap.name = name || existingMap.name;
    existingMap.description = description || existingMap.description;
    if (coordinates) {
      existingMap.coordinates = { type: "Point", coordinates };
    }

    const updatedMap = await existingMap.save();
    io.emit("updateMap", updatedMap);

    res.json(updatedMap);
  } catch (error) {
    console.error("Error in updateMap controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMap = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedMap = await MapModel.findByIdAndDelete(id);

    if (!deletedMap) {
      return res.status(404).json({ error: "Map not found" });
    }

    io.emit("deleteMap", id);

    res.json({ message: "Map deleted successfully" });
  } catch (error) {
    console.error("Error in deleteMap controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMaps = async (req, res) => {
  try {
    const maps = await MapModel.find().populate({
      path: 'createdBy',
      select: '-password'
    });
    res.json(maps);
  } catch (error) {
    console.error("Error in getMaps controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
export const getMap = async (req, res) => {
  try {
    const userId = req.user._id;
    const maps = await MapModel.find({ createdBy: userId }).populate({
      path: 'createdBy',
      select: '-password'
    });
    if (!maps.length) {
      return res.status(404).json({ error: "No maps found for this user" });
    }
    res.json(maps);
  } catch (error) {
    console.error("Error in getMap controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};