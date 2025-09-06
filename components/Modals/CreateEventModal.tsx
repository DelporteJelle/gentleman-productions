import { useEffect, useState } from "react";
import {
  Modal,
  TextInput,
  Textarea,
  Group,
  Button,
  Stack,
  Stepper,
  NumberInput,
  Paper,
  CloseButton,
  Badge,
} from "@mantine/core";
import { DbObjectType, Event } from "@/types";
import { formRootRule, isNotEmpty, useForm } from "@mantine/form";
import { DateInput, TimeInput } from "@mantine/dates";
import { usePosts } from "@/app/contexts/PostsContext";

interface CreateEventModalProps {
  opened: boolean;
  onClose: () => void;
  event?: Event;
}

export default function CreateEventModal({
  opened,
  onClose,
  event,
}: CreateEventModalProps) {
  const { createEvent, editEvent } = usePosts();

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      title: "",
      description: "",
      display_image: "",
      eventLocation: {
        country: "België",
        city: "",
        street: "",
        location: undefined,
      },
      dates: [
        {
          uuid: crypto.randomUUID(),
          date: "",
          timeLine: [
            { time: "18:00", description: "Start" },
            { time: "22:00", description: "End" },
          ],
          price: undefined,
        },
      ],
      images: [""],
    },
    validate: {
      title: (value) => (value.trim() ? null : "Title is required"),
      description: (value) => (value.trim() ? null : "Description is required"),
      display_image: (value) =>
        value.trim() ? null : "Display image URL is required",
      eventLocation: {
        country: (value) => (value.trim() ? null : "Country is required"),
        city: (value) => (value.trim() ? null : "City is required"),
        street: (value) => (value.trim() ? null : "Street address is required"),
      },
      dates: (value) => {
        if (value.length === 0) {
          return "At least one date entry is required";
        }
        for (const date of value) {
          if (!date.date) {
            return "Date value is required";
          }
          if (date.timeLine.length < 2) {
            return "At least 2 timeline entries are required (start and end)";
          }
          for (const entry of date.timeLine) {
            if (!entry.time || !entry.description) {
              return "Time and description are required for each timeline entry";
            }
          }
          for (let i = 1; i < date.timeLine.length; i++) {
            if (date.timeLine[i] < date.timeLine[i - 1]) {
              return "Make sure the timeline entries are in order";
            }
          }
        }
        return null;
      },
    },

    // validate: (values) => {
    //   if (active === 0) {
    //     return {
    //       title: values.title.trim() ? null : "Title is required",
    //       description: values.description.trim()
    //         ? null
    //         : "Description is required",
    //       display_image: values.display_image.trim()
    //         ? null
    //         : "Display image URL is required",
    //     };
    //   }
    //   if (active === 1) {
    //     return {
    //       eventLocation: {
    //         country: values.eventLocation.country.trim()
    //           ? null
    //           : "Country is required",
    //         city: values.eventLocation.city.trim() ? null : "City is required",
    //         street: values.eventLocation.street.trim()
    //           ? null
    //           : "Street address is required",
    //         location: values.eventLocation.location.trim()
    //           ? null
    //           : "Event building or location is required",
    //       },
    //     };
    //   }
    //   if (active === 2) {
    //     return {};
    //   }

    //   return {};
    // },
  });

  // Populate form with event data when editing
  // useEffect(() => {
  //   if (event) {
  //     form.setValues({
  //       title: event.title,
  //       description: event.description,
  //       display_image: event.display_image,
  //       eventLocation: event.eventlocation
  //         ? {
  //             ...event.eventlocation,
  //             location: event.eventlocation.location,
  //           }
  //         : {
  //             country: "",
  //             city: "",
  //             street: "",
  //             location: undefined,
  //           },
  //       dates: event.dates.map((date) => ({
  //         uuid: date.uuid,
  //         date: new Date(date.start_time).toISOString().split("T")[0],
  //         timeLine: date.timeLine,
  //         price: date.price,
  //       })),
  //       images: event.images || [""],
  //     });
  //   } else {
  //     form.reset();
  //   }
  // }, [event, form]);

  const [active, setActive] = useState(0);
  const nextStep = () => {
    setActive((current) => current + 1);
    // setActive((current) => {
    //   if (form.validate().hasErrors) {
    //     return current;
    //   }
    //   return current < 2 ? current + 1 : current;
    // });
  };
  const prevStep = () =>
    setActive((current) => (current > 0 ? current - 1 : current));

  const handleSubmit = () => {
    form.validate();
    if (!form.isValid()) return;

    const eventData = {
      ...form.values,
      eventlocation: form.values.eventLocation,
      uuid: crypto.randomUUID() as string,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      post_type: DbObjectType.EVENT,
      dates: form.values.dates.map((date) => {
        const startTime = date.timeLine[0].time.split(":").map(Number);
        const endTime = date.timeLine[date.timeLine.length - 1].time
          .split(":")
          .map(Number);
        const startDate = new Date(date.date);
        const endDate = new Date(date.date);
        startDate.setHours(startTime[0], startTime[1]);
        endDate.setHours(endTime[0], endTime[1]);

        return {
          ...date,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        };
      }),
    };

    if (event) {
      editEvent(event.uuid, { ...eventData });
    } else {
      createEvent(eventData);
    }
    onClose();
  };

  const dates = form.getValues().dates.map((date, index) => (
    <Paper key={date.uuid} p={"10"} radius="md" withBorder>
      <CloseButton
        color="red"
        onClick={() => form.removeListItem("dates", index)}
      />
      <Group grow>
        <DateInput
          required
          label="Date"
          key={form.key(`dates.${index}.date`)}
          {...form.getInputProps(`dates.${index}.date`)}
        />
        <NumberInput
          label="price"
          placeholder="Enter ticket price"
          key={form.key(`dates.${index}.price`)}
          {...form.getInputProps(`dates.${index}.price`)}
        />
      </Group>

      <Group>
        {form
          .getValues()
          .dates[index].timeLine.map((timeLineEntry, timeIndex) => (
            <Paper key={timeIndex} p={"10"} radius="md" withBorder w={150}>
              <CloseButton
                color="red"
                onClick={() =>
                  form.removeListItem(`dates.${index}.timeLine`, timeIndex)
                }
              />
              <TextInput
                label="Time"
                type="time"
                required
                key={form.key(`dates.${index}.timeLine.${timeIndex}.time`)}
                {...form.getInputProps(
                  `dates.${index}.timeLine.${timeIndex}.time`,
                )}
                onChange={(e) =>
                  (form.values.dates[index].timeLine[timeIndex].time =
                    e.target.value)
                }
              />
              <TextInput
                required
                label="Description"
                placeholder="Enter description"
                key={form.key(
                  `dates.${index}.timeLine.${timeIndex}.description`,
                )}
                {...form.getInputProps(
                  `dates.${index}.timeLine.${timeIndex}.description`,
                )}
                onChange={(e) =>
                  (form.values.dates[index].timeLine[timeIndex].description =
                    e.target.value)
                }
              />
            </Paper>
          ))}
      </Group>
      <Button
        variant="default"
        onClick={() => {
          form.insertListItem(`dates.${index}.timeLine`, {
            time: "",
            description: "",
          });
        }}
      >
        Add timeline entry
      </Button>
    </Paper>
  ));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Event"
      size={"auto"}
    >
      <Stepper active={active} onStepClick={setActive}>
        {/* ====================== Event info ==================== */}
        <Stepper.Step
          color="yellow"
          label="Event info"
          description="Give the title, content and a display image."
        >
          <Stack>
            <TextInput
              required
              label="Title"
              placeholder="Enter event title"
              key={form.key("title")}
              {...form.getInputProps("title")}
            />
            <Textarea
              required
              label="Description"
              placeholder="Enter event description"
              key={form.key("description")}
              {...form.getInputProps("description")}
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event location ==================== */}

        <Stepper.Step
          color="yellow"
          label="Location"
          description="Set the event location"
        >
          <Stack>
            <TextInput
              required
              label="Country"
              placeholder="Enter country"
              key={form.key("eventLocation.country")}
              {...form.getInputProps("eventLocation.country")}
            />
            <TextInput
              required
              label="City"
              placeholder="Enter city"
              key={form.key("eventLocation.city")}
              {...form.getInputProps("eventLocation.city")}
            />
            <TextInput
              required
              label="Street"
              placeholder="Enter street address"
              key={form.key("eventLocation.street")}
              {...form.getInputProps("eventLocation.street")}
            />
            <TextInput
              label="Location"
              placeholder="Enter event building or location"
              key={form.key("eventLocation.location")}
              {...form.getInputProps("eventLocation.location")}
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event dates ==================== */}

        <Stepper.Step
          color="yellow"
          label="Set the date"
          description="Set the event date(s)"
        >
          <Stack>
            {dates}
            <Button
              color="yellow"
              onClick={() => {
                form.insertListItem("dates", {
                  uuid: crypto.randomUUID(),
                  start: "",
                  end: "",
                  timeLine: [
                    {
                      time: "",
                      description: "Starting time",
                    },
                  ],
                  price: undefined,
                });
              }}
            >
              Add Date Entry
            </Button>
          </Stack>
        </Stepper.Step>

        {/* ====================== Event images ==================== */}

        <Stepper.Step
          color="yellow"
          label="Event images"
          description="Add display image and additional images"
        >
          <Stack>
            <TextInput
              required
              label="Image URL"
              placeholder="Enter display image URL"
              key={form.key("display_image")}
              {...form.getInputProps("display_image")}
            />
            {form.getValues().images.map((image, index) => (
              <Group key={index}>
                <TextInput
                  label={`Image URL ${index + 1}`}
                  placeholder="Enter image URL"
                  key={form.key(`images.${index}`)}
                  {...form.getInputProps(`images.${index}`)}
                />
                <CloseButton
                  color="red"
                  onClick={() => form.removeListItem("images", index)}
                />
              </Group>
            ))}
            <Button
              variant="default"
              onClick={() => form.insertListItem("images", "")}
            >
              Add Image URL
            </Button>
          </Stack>
        </Stepper.Step>

        <Stepper.Completed>
          {/* {!form.isValid() && } */}
          {Object.keys(form.errors).length > 0 && (
            <Stack>
              {Object.entries(form.errors).map(([field, error]) => (
                <Badge key={field} color="red" variant="filled">
                  {error}
                </Badge>
              ))}
            </Stack>
          )}
        </Stepper.Completed>
      </Stepper>

      <Group justify="center" mt="xl">
        <Button variant="default" onClick={prevStep}>
          Back
        </Button>
        <Button color="red" onClick={active === 4 ? handleSubmit : nextStep}>
          {active === 4 ? "Create Event" : "Next step"}
        </Button>
      </Group>
    </Modal>
  );
}
