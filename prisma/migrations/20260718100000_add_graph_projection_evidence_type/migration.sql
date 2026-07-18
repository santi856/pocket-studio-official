-- AlterEnum: adds GRAPH_PROJECTION to the closed ProductEvidenceType
-- vocabulary (Stage 3, D-0081/D-0082) -- surfaced only during real
-- implementation of the Graph Projector's evidence recording; the
-- architecture proposal referenced this value without flagging it as a
-- required migration, corrected here directly rather than silently
-- worked around.
ALTER TYPE "ProductEvidenceType" ADD VALUE 'GRAPH_PROJECTION';
