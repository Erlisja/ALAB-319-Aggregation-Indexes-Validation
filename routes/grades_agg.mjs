import express from "express";
import db from "../db/conn.mjs";
import { ObjectId } from "mongodb";

const router = express.Router();

/**
 * It is not best practice to seperate these routes
 * like we have done here. This file was created
 * specifically for educational purposes, to contain
 * all aggregation routes in one place.
 */

/**
 * Grading Weights by Score Type:
 * - Exams: 50%
 * - Quizes: 30%
 * - Homework: 20%
 */

// Get the weighted average of a specified learner's grades, per class
router.get("/learner/:id/avg-class", async (req, res) => {
  let collection = await db.collection("grades");

  let result = await collection
    .aggregate([
      {
        $match: { student_id: Number(req.params.id) },
      },
      {
        $unwind: { path: "$scores" },
      },
      {
        $group: {
          _id: "$class_id",
          quiz: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "quiz"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
          exam: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "exam"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
          homework: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "homework"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          class_id: "$_id",
          avg: {
            $sum: [
              { $multiply: [{ $avg: "$exam" }, 0.5] },
              { $multiply: [{ $avg: "$quiz" }, 0.3] },
              { $multiply: [{ $avg: "$homework" }, 0.2] },
            ],
          },
        },
      },
    ])
    .toArray();

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

//======== REQUIREMENT 1 =========

// Create a GET route at /grades/stats
// Within this route, create an aggregation pipeline that returns the following information:
// The number of learners with a weighted average (as calculated by the existing routes) higher than 70%.
// The total number of learners.
// The percentage of learners with an average above 70% (a ratio of the above two outputs).

router.get("/stats", async (req, res) => {
  try {
    let collection = await db.collection("grades");

    let result = await collection
      .aggregate([
        // Step 1: Unwind the 'scores' array
        {
          $unwind: { path: "$scores" },
        },
        // Step 2: Group by student_id and calculate average weighted score
        {
          $group: {
            _id: "$student_id", // Group by student_id
            quiz: {
              $push: {
                $cond: {
                  if: { $eq: ["$scores.type", "quiz"] },
                  then: "$scores.score",
                  else: "$$REMOVE",
                },
              },
            },
            exam: {
              $push: {
                $cond: {
                  if: { $eq: ["$scores.type", "exam"] },
                  then: "$scores.score",
                  else: "$$REMOVE",
                },
              },
            },
            homework: {
              $push: {
                $cond: {
                  if: { $eq: ["$scores.type", "homework"] },
                  then: "$scores.score",
                  else: "$$REMOVE",
                },
              },
            },
          },
        },
        // Step 3: Project the average weighted score and remove the _id field
        {
          $project: {
            _id: 0,
            student_id: "$_id",
            avg: {
              $sum: [
                { $multiply: [{ $avg: "$exam" }, 0.5] }, // 50% exam
                { $multiply: [{ $avg: "$quiz" }, 0.3] }, // 30% quiz
                { $multiply: [{ $avg: "$homework" }, 0.2] }, // 20% homework
              ],
            },
          },
        },
        // Step 4: Filter learners with an average score above 70
        {
          $match: { avg: { $gt: 70 } },
        },
        // Step 5: Calculate the count of learners with avg > 70
        {
          $group: {
            _id: null,
            countAbove70: { $sum: 1 }, // Count of learners above 70%
          },
        },
        // Step 6: Calculate the total number of learners
        {
          $lookup: {
            from: "grades", // Lookup on the same collection to get total count
            pipeline: [
              { $group: { _id: null, total: { $sum: 1 } } }, // Count total learners
            ],
            as: "total",
          },
        },
        // Step 7: Project the final stats: countAbove70, total, and percentage
        {
          $project: {
            countAbove70: 1,
            total: { $arrayElemAt: ["$total.total", 0] }, // Get the total count from the lookup
            percentageAbove70: {
              $multiply: [
                { $divide: ["$countAbove70", { $arrayElemAt: ["$total.total", 0] }] },
                100,
              ], // Calculate percentage of learners with avg > 70
            },
          },
        },
      ])
      .toArray();

    if (result.length === 0) {
      res.status(404).send("No data found");
    } else {
      res.status(200).send(result);
    }
  } catch (err) {
    console.error("Error: ", err);
    res.status(500).send("Internal server error");
  }
});

//======== REQUIREMENT 2 =========
// Create a GET route at /grades/stats/:id
// Within this route, mimic the above aggregation pipeline, but only for learners within a class that has a class_id equal to the specified :id.
// Create a single-field index on class_id.
// Create a single-field index on learner_id.
// Create a compound index on learner_id and class_id, in that order, both ascending.
// Create the following validation rules on the grades collection:
// Each document must have a class_id field, which must be an integer between 0 and 300, inclusive.
// Each document must have a learner_id field, which must be an integer greater than or equal to 0.
// Change the validation action to "warn."


// Create indexes for class_id, learner_id, and compound index
async function createIndexes() {
  try {
    await db.collection("grades").createIndex({ class_id: 1 });
    await db.collection("grades").createIndex({ learner_id: 1 });
    await db.collection("grades").createIndex({ learner_id: 1, class_id: 1 });
    console.log("Indexes created successfully.");
  } catch (error) {
    console.error("Error creating indexes: ", error);
  }
}

createIndexes();
// Route to get stats for a specific class
router.get("/stats/:id", async (req, res) => {
  const classId = parseInt(req.params.id, 10);

  try {
    let collection = db.collection("grades");

    // Aggregation pipeline to calculate statistics for the specified class
    let result = await collection.aggregate([
      {
        $match: { class_id: classId }, // Match documents with the specified class_id
      },
      {
        $unwind: { path: "$scores" }, // Unwind the scores array
      },
      {
        $group: {
          _id: "$student_id",
          quiz: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "quiz"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
          exam: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "exam"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
          homework: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "homework"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          student_id: "$_id",
          avg: {
            $sum: [
              { $multiply: [{ $avg: "$exam" }, 0.5] },
              { $multiply: [{ $avg: "$quiz" }, 0.3] },
              { $multiply: [{ $avg: "$homework" }, 0.2] },
            ],
          },
        },
      },
      {
        $match: { avg: { $gt: 70 } }, // Filter for students with average > 70
      },
      {
        $group: {
          _id: null,
          countAbove70: { $sum: 1 }, // Count students with avg > 70
          total: { $sum: 1 }, // Total number of students in the class
        },
      },
      {
        $project: {
          _id: 0,
          countAbove70: 1,
          total: 1,
          percentageAbove70: {
            $cond: {
              if: { $eq: ["$total", 0] },
              then: 0,
              else: { $divide: ["$countAbove70", "$total"] },
            },
          }, // Calculate percentage
        },
      },
    ]).toArray();

    if (!result || result.length === 0) {
      return res.status(404).send("No data found for the specified class.");
    }

    res.status(200).send(result);
  } catch (error) {
    console.error("Error in aggregation:", error);
    res.status(500).send("An error occurred while processing the request.");
  }
});



export default router;
