import mongoose from "mongoose";

const mapSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      default: "No description provided."
    },
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        required: true
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: function (arr) {
            return arr.length === 2 && arr.every(num => typeof num === "number");
          },
          message: "Coordinates must be an array of two numbers [longitude, latitude]."
        }
      }
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

// Unique geospatial index
mapSchema.index({ coordinates: "2dsphere", name: 1 }, { unique: true });

const MapModel = mongoose.model("Map", mapSchema);

export default MapModel;
