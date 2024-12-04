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
    const stats = await db
      .collection("grades")
      .aggregate([
        // Step 1: Unwind the scores array to process individual scores
        {
          $unwind: "$scores",
        },
        // Step 2: Group scores by student_id to calculate weighted averages
        {
          $group: {
            _id: "$student_id",
            quizScores: {
              $push: {
                $cond: [
                  { $eq: ["$scores.type", "quiz"] },
                  "$scores.score",
                  null,
                ],
              },
            },
            examScores: {
              $push: {
                $cond: [
                  { $eq: ["$scores.type", "exam"] },
                  "$scores.score",
                  null,
                ],
              },
            },
            homeworkScores: {
              $push: {
                $cond: [
                  { $eq: ["$scores.type", "homework"] },
                  "$scores.score",
                  null,
                ],
              },
            },
          },
        },
        // Step 3: Calculate weighted averages
        {
          $project: {
            _id: 0,
            student_id: "$_id",
            weightedAverage: {
              $sum: [
                { $multiply: [{ $avg: "$quizScores" }, 0.3] },
                { $multiply: [{ $avg: "$examScores" }, 0.5] },
                { $multiply: [{ $avg: "$homeworkScores" }, 0.2] },
              ],
            },
          },
        },
        // Step 4: Calculate the total learners and those with averages above 70%
        {
          $group: {
            _id: null,
            totalLearners: { $sum: 1 },
            above70Count: {
              $sum: { $cond: [{ $gt: ["$weightedAverage", 70] }, 1, 0] },
            },
          },
        },
        // Step 5: Calculate the percentage of learners above 70%
        {
          $project: {
            totalLearners: 1,
            above70Count: 1,
            above70Percentage: {
              $multiply: [
                { $divide: ["$above70Count", "$totalLearners"] },
                100,
              ],
            },
          },
        },
      ])
      .toArray();

    if (!stats.length) {
      return res.status(404).send({ error: "No learners found" });
    }

    res.status(200).send(stats[0]);
  } catch (error) {
    console.error("Failed to calculate stats:", error);
    res.status(500).send({ error: "Internal Server Error" });
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



router.get("/stats/:id", async (req, res) => {
  const classId = Number(req.params.id); // Convert class_id to number

  if (isNaN(classId)) {
    return res.status(400).send({ error: "Invalid class ID format" });
  }

  try {
    const stats = await db
      .collection("grades")
      .aggregate([
        { $match: { class_id: classId } }, // Filter by class_id
        {
          $group: {
            _id: "$learner_id", // Group by learner
            quizScores: {
              $push: {
                $cond: [
                  { $eq: ["$scores.type", "quiz"] },
                  "$scores.score",
                  null,
                ],
              },
            },
            examScores: {
              $push: {
                $cond: [
                  { $eq: ["$scores.type", "exam"] },
                  "$scores.score",
                  null,
                ],
              },
            },
            homeworkScores: {
              $push: {
                $cond: [
                  { $eq: ["$scores.type", "homework"] },
                  "$scores.score",
                  null,
                ],
              },
            },
          },
        },
        {
          $project: {
            learner_id: "$_id",
            weightedAverage: {
              $sum: [
                { $multiply: [{ $avg: "$quizScores" }, 0.3] },
                { $multiply: [{ $avg: "$examScores" }, 0.5] },
                { $multiply: [{ $avg: "$homeworkScores" }, 0.2] },
              ],
            },
          },
        },
        {
          $group: {
            _id: null, // Group all learners into the class
            totalLearners: { $sum: 1 },
            above70Count: {
              $sum: { $cond: [{ $gt: ["$weightedAverage", 70] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            totalLearners: 1,
            above70Count: 1,
            above70Percentage: {
              $multiply: [
                { $divide: ["$above70Count", "$totalLearners"] },
                100,
              ],
            },
          },
        },
      ])
      .toArray();

    if (!stats.length) {
      return res.status(404).send({ error: "No data found for this class" });
    }

    res.status(200).send(stats[0]);
  } catch (error) {
    console.error("Failed to calculate class stats:", error);
    res.status(500).send({ error: "Internal Server Error" });
  }
});




router.post(`/create-indexes`, async (req, res) => {
  try {
    const collection = await db.collection(`grades`);

    //Create single-field index on class_id
    await collection.createIndex({ class_id: 1 });

    //Create single-field index on learner_id
    await collection.createIndex({ learner_id: 1 });

    //Create single-field index on learner_id and class_id
    await collection.createIndex({ learner_id: 1, class_id: 1 });

    res.status(200).send({ message: `Indexes created successfully` });
  } catch (error) {
    console.error(`Error creating indexes`, error);
    res.status(500).send({ error: `Failed to create indexes` });
  }
}); 



export default router;
